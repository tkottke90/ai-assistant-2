import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { RunnableToolLike } from "@langchain/core/runnables";
import type { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { createAgent, toolRetryMiddleware } from "langchain";
import type { Logger } from "winston";
import { checkpointer } from '../../lib/database';
import { Agent, AgentSchema } from "../models/agent";
import { AgentModel } from "../prisma/models";
import type { ToolManager } from "../tools/manager";
import { Queue } from "../types/queue";
import { createRecursiveScratchpadMiddleware } from "./middleware/recursive-2";
import { createToolSummaryMiddleware } from './middleware/tool-summary';
import { createUsageMiddleware } from './middleware/usage';

export class AgentRuntime {
  private queue = new Queue<any>();

  readonly name: string;
  readonly description?: string;
  readonly systemPrompt: string;
  readonly autoStart: boolean;

  constructor(
    private readonly agent: Agent,
    readonly llm: BaseChatModel,
    private readonly toolManager: ToolManager,
    readonly logger: Logger,
  ) {
    this.name = agent.name;
    this.description = agent.description ?? '';
    this.systemPrompt = agent.system_prompt;
    this.autoStart = agent.auto_start;
  }

  get id() {
    return this.agent.agent_id;
  }

  get agentDetails() {
    return ({
      name: this.name,
      llm: this.agent.engine,
      model: this.agent.model
    });
  }

  async getAgent(_shutdownSignal: AbortSignal) {
    const systemPromptText = [
      this.systemPrompt,
      `<identity>The user will refer to you as ${this.name}.</identity>`,
      // MEMORY_SYSTEM_PROMPT
    ].join('\n\n');

    return createAgent({
      model: this.llm,
      name: this.name,
      checkpointer,
      systemPrompt: new SystemMessage(systemPromptText),
      tools: await this.getTools() as any,
      middleware: [
        toolRetryMiddleware({
          maxRetries: 3,
          backoffFactor: 2.0,
          initialDelayMs: 1000,
          retryOn: (err) => err.name === 'ToolUseException' || err.message.includes('tool call failed'),
          onFailure: (err, context) => {
            // When the tool call fails after the max retries, we want to return a description
            // of what the error was and some guidance for next steps, rather than just returning an error message.
            const response = [
              'The tool call failed with the following error message:',
              `${err.name}: ${err.message}.`,
              'Review the error message for any clues on what went wrong and any recommended next steps.',
              'Do NOT retry the same call with the same inputs. Instead, try a different approach or use different arguments.',
              '\n\n **Common Issues**:',
              '\n- Invalid arguments: Check if the arguments you provided to the tool are correct and in the expected format. Review the tool documentation and error message for any hints on what might be wrong with the arguments.',
              '\n- Rate limits: You may have hit a rate limit for the tool or an external API it uses. Stop and ask the user to try again later',
              '\n- Permissions: The tool may require certain permissions or access that it does not have. Stop and let the user know to review the tool configuration and permissions.',
            ].join(' ');

            this.logger.error(`Tool call failed after retries: ${err.message}`, { context })
            return response;
          },
        }),
        // createRecursiveScratchpadMiddleware(this.name, this.llm, this.logger.child({ location: `AgentRuntime.${this.name}.Scratchpad` })),
        // createToolSummaryMiddleware(this.name, this.logger, this.llm),
        createUsageMiddleware(this.llm, this.name, this.logger)
      ],
    });
  }

  /** Returns the flat tools array for this agent. */
  async getTools(): Promise<(StructuredToolInterface | DynamicTool | RunnableToolLike)[]> {

    if (this.toolManager) {
      // toolManager.getBuiltinTools() already includes memory tools
      const builtins = this.toolManager.getBuiltinTools(this.id);
      const assigned = await this.toolManager.getToolsForAgent(this.id);
      return [...builtins, ...assigned];
    }
    // Fallback: memory tools only (no ToolManager available)
    return [];
    // return [...createMemoryTools(this.id) as StructuredTool[]];
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

  static fromDatabase(agentData: AgentModel, llm: BaseChatModel, toolManager: ToolManager, logger: Logger) {
    return new AgentRuntime(
      AgentSchema.parse(agentData),
      llm,
      toolManager,
      logger.child({ location: `AgentRuntime:${agentData.name}` }),
    );
  }
}