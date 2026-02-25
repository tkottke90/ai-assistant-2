import { EventEmitter } from "node:stream";
import { AgentRuntime } from "./agent-runtime";
import { NotFoundError } from "../errors/http.errors";
import { Logger } from "winston";

export class AgentManager extends EventEmitter {
  private agents = new Map<number, AgentRuntime>();
  private activeAgents = new Set<number>();

  constructor(
    private readonly logger: Logger
  ) { super(); }

  registerAgent(agent: AgentRuntime) {
    this.logger.debug(`Registering agent: ${agent.name} (ID: ${agent.id})`);

    this.agents.set(agent.id, agent);
  }

  isActive(agentId: number) {
    return this.activeAgents.has(agentId);
  }

  startAgent(agentId: number) {
    if (!this.agents.has(agentId)) {
      throw new NotFoundError('Agent not found');
    }

    this.activeAgents.add(agentId);
    this.emit('agentStarted', agentId);
  }

  stopAgent(agentId: number) {
    if (!this.agents.has(agentId)) {
      throw new NotFoundError('Agent not found');
    }

    this.activeAgents.delete(agentId);
    this.emit('agentStopped', agentId);
  }
}