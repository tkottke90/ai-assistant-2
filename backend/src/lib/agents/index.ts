import express from 'express';
import { AgentSchema } from '../config/agents.schema';
import { AgentManager } from './agent-manager';
import AgentDao from '../dao/agent.dao';

export default async function initializeAgents(app: express.Application) {
  app.logger.info('Initializing Agent Manager');
  const agentLogger = app.logger.child({ location: 'AgentManager' });

  const agentsConfig = app.config.loadConfig('agents', AgentSchema);
  const scratchpadCfg = agentsConfig.scratchpad;
  const scratchpadLlm = scratchpadCfg?.llm
    ? scratchpadCfg.model
      ? app.llm.getClientWithModel(scratchpadCfg.llm, scratchpadCfg.model)
      : app.llm.getClient(scratchpadCfg.llm)
    : undefined;

  app.agents = new AgentManager(agentLogger, app.tools, scratchpadCfg, scratchpadLlm);

  // Load all agents from the database and register them with the Agent Manager
  const agents = await AgentDao.getAllAgents()
  
  for (const agentData of agents) {
    const llmEngine = agentData.engine && agentData.model
      ? app.llm.getClientWithModel(agentData.engine, agentData.model)
      : app.llm.getClient(agentData.engine);
    const agentRuntime = app.agents.createRuntime(agentData as any, llmEngine);
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
