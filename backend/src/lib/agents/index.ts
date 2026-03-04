import express from 'express';
import { AgentRuntime } from "./agent-runtime";
import { AgentManager } from './agent-manager';
import AgentDao from '../dao/agent.dao';

export default async function initializeAgents(app: express.Application) {
  app.logger.info('Initializing Agent Manager');
  const agentLogger = app.logger.child({ location: 'AgentManager' });
  app.agents = new AgentManager(agentLogger);

  // Load all agents from the database and register them with the Agent Manager
  const agents = await AgentDao.getAllAgents()
  
  for (const agentData of agents) {
    const llmEngine = app.llm.getClient(agentData.engine);
    // Pass ToolManager if available (set by setupTools before setupAgentManager)
    const runtimeLogger = app.logger.child({ location: `Agent:${agentData.name}` });
    const agentRuntime = AgentRuntime.fromDatabase(agentData as any, llmEngine, app.tools, runtimeLogger);
    app.agents.registerAgent(agentRuntime);

    if (agentData.auto_start) {
      app.agents.startAgent(agentData.agent_id);
    }
  }

  // Listen for action resolution events emitted by the PATCH /tools/actions/:id controller.
  // When a permission request is approved or denied, resume the suspended agent graph
  // on the originating thread so it can continue without requiring a new user message.
  app.agents.on('action_resolved', async (payload: {
    agentId: number;
    actionId: string;
    threadId: string;
    status: 'approved' | 'denied';
  }) => {
    const runtime = app.agents.getAgent(payload.agentId);
    if (!runtime) {
      agentLogger.warn(`action_resolved: no runtime for agent ${payload.agentId}`);
      return;
    }
    if (!app.agents.isActive(payload.agentId)) {
      agentLogger.debug(`action_resolved: agent ${payload.agentId} is not active, skipping resume`);
      return;
    }
    await runtime.resumeAfterAction(payload.threadId, payload.actionId, payload.status);
  });
}
