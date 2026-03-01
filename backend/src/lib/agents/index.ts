import express from 'express';
import { AgentRuntime } from "./agent-runtime";
import { AgentManager } from './agent-manager';
import AgentDao from '../dao/agent.dao';

export default async function initializeAgents(app: express.Application) {
  app.logger.info('Initializing Agent Manager');
  app.agents = new AgentManager(
    app.logger.child({ location: 'AgentManager' })
  );

  // Load all agents from the database and register them with the Agent Manager
  const agents = await AgentDao.getAllAgents()
  
  for (const agentData of agents) {
    const llmEngine = app.llm.getClient(agentData.engine);

    const agentRuntime = new AgentRuntime(agentData, llmEngine);
    app.agents.registerAgent(agentRuntime);

    if (agentData.auto_start) {
      app.agents.startAgent(agentData.agent_id);
    }
  }
}
