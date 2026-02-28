import { EventEmitter } from "node:stream";
import { AgentRuntime } from "./agent-runtime";
import { NotFoundError } from "../errors/http.errors";
import { Logger } from "winston";

export class AgentManager extends EventEmitter {
  private agents = new Map<number, AgentRuntime>();
  private activeAgents = new Set<number>();

  private readonly shutdownSignal: AbortController = new AbortController();

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

  getAgent(agentId: number): AgentRuntime | undefined {
    return this.agents.get(agentId);
  }

  listActiveAgents() {
    return Array.from(this.activeAgents)
      .map(id => this.agents.get(id))
      .filter(Boolean) as AgentRuntime[]; // Casting here since Maps can return undefined, but we filter those out.
  }
  
  shutdown() {
    this.logger.info('Shutting down Agent Manager, stopping all active agents');

    this.shutdownSignal.abort();
    this.activeAgents.clear();
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