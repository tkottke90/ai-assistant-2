import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Agent, AgentSchema } from "../models/agent";
import { Queue } from "../types/queue";
import { createAgent } from "langchain";
import { checkpointer } from '../../lib/database';
import { AgentModel } from "../prisma/models";
import { createMemoryTools } from "../tools/memory-tools";
import { MEMORY_SYSTEM_PROMPT } from "./memory-prompt";

export class AgentRuntime {
  private queue = new Queue<any>();

  readonly name: string;
  readonly description?: string;
  readonly systemPrompt: string;
  readonly autoStart: boolean;

  constructor(
    private readonly agent: Agent,
    private readonly llm: BaseChatModel,
  ) {
    this.name = agent.name;
    this.description = agent.description ?? '';
    this.systemPrompt = agent.system_prompt;
    this.autoStart = agent.auto_start;
  }

  get id() {
    return this.agent.agent_id;
  }

  getAgent(shutdownSignal: AbortSignal) {
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
      tools: this.getTools(),
      signal: shutdownSignal
    })
  }

  getTools() {
    return [
      ...createMemoryTools(this.id)
    ];
  }

  newMessage(message: any) {
    this.queue.enqueue(message);
  }

  static fromDatabase(agentData: AgentModel, llm: BaseChatModel) {
    return new AgentRuntime(
      AgentSchema.parse(agentData),
      llm
    );
  }
}