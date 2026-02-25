import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Agent } from "../models/agent";
import { Queue } from "../types/queue";

export class AgentRuntime {
  private queue = new Queue<any>();

  readonly name: string;
  readonly description?: string;
  readonly systemPrompt: string;
  readonly autoStart: boolean;

  constructor(
    private readonly agent: Agent,
    private readonly llm: BaseChatModel
  ) {
    this.name = agent.name;
    this.description = agent.description ?? '';
    this.systemPrompt = agent.system_prompt;
    this.autoStart = agent.auto_start;
  }

  get id() {
    return this.agent.agent_id;
  }

  newMessage(message: any) {
    this.queue.enqueue(message);
  }

  private nextTask() {

  }
}