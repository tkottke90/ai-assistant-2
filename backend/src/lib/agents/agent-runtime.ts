import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Agent, AgentSchema } from "../models/agent";
import { Queue } from "../types/queue";
import { createAgent } from "langchain";
import { checkpointer } from '../../lib/database';
import { AgentModel } from "../prisma/models";
import { createMemoryTools } from "../tools/builtin/memory-tools";
import { MEMORY_SYSTEM_PROMPT } from "./memory-prompt";
import type { ToolManager } from "../tools/manager";
import type { StructuredTool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import type { Logger } from "winston";

export class AgentRuntime {
  private queue = new Queue<any>();

  readonly name: string;
  readonly description?: string;
  readonly systemPrompt: string;
  readonly autoStart: boolean;

  constructor(
    private readonly agent: Agent,
    readonly llm: BaseChatModel,
    private readonly toolManager?: ToolManager,
    private readonly logger?: Logger,
  ) {
    this.name = agent.name;
    this.description = agent.description ?? '';
    this.systemPrompt = agent.system_prompt;
    this.autoStart = agent.auto_start;
  }

  get id() {
    return this.agent.agent_id;
  }

  async getAgent(shutdownSignal: AbortSignal) {
    const systemPrompt = [
      this.systemPrompt,
      `The user will refer to you as ${this.name}.`,
      MEMORY_SYSTEM_PROMPT
    ].join('\n\n');

    return createAgent({
      model: this.llm,
      name: this.name,
      checkpointer,
      systemPrompt,
      tools: await this.getTools(),
      signal: shutdownSignal
    })
  }

  async getTools(): Promise<StructuredTool[]> {
    if (this.toolManager) {
      // toolManager.getBuiltinTools() already includes memory tools
      const builtins = this.toolManager.getBuiltinTools(this.id);
      const assigned = await this.toolManager.getToolsForAgent(this.id);
      return [...builtins, ...assigned];
    }
    // Fallback: memory tools only (no ToolManager available)
    return createMemoryTools(this.id) as StructuredTool[];
  }

  newMessage(message: any) {
    this.queue.enqueue(message);
  }

  /**
   * Resumes a suspended LangGraph agent graph after a permission request is resolved.
   * Called by AgentManager when an `action_resolved` event is received.
   *
   * LangGraph's interrupt() + Command({ resume }) mechanism:
   * - `interrupt()` in request_permission pauses the graph at the current node
   * - Re-invoking with `Command({ resume: status })` resumes from that exact point
   * - All produced messages are automatically persisted to the checkpointer
   */
  async resumeAfterAction(threadId: string, actionId: string, status: 'approved' | 'denied'): Promise<void> {
    const abortController = new AbortController();
    const agent = await this.getAgent(abortController.signal);
    try {
      this.logger?.info(`Resuming agent ${this.name} on thread ${threadId} after action ${actionId} (${status})`);
      const stream = agent.stream(
        new Command({ resume: status }),
        { streamMode: ['updates'], configurable: { thread_id: threadId } }
      );
      // Consume the stream so all messages are persisted to the checkpointer
      for await (const _chunk of await stream) { /* drain */ }
      this.logger?.info(`Agent ${this.name} resume complete for action ${actionId}`);
    } catch (err: any) {
      this.logger?.error(`Agent ${this.name} resume failed for action ${actionId}: ${err?.message ?? err}`);
    } finally {
      abortController.abort();
    }
  }

  static fromDatabase(agentData: AgentModel, llm: BaseChatModel, toolManager?: ToolManager, logger?: Logger) {
    return new AgentRuntime(
      AgentSchema.parse(agentData),
      llm,
      toolManager,
      logger,
    );
  }
}