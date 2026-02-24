import { CreateAgentDTO } from '../models/agent.js';
import { prisma } from '../database.js';

function createAgent(agentData: CreateAgentDTO) {
  return prisma.agent.create({
    data: agentData
  });
}

function listAgents() {
  return prisma.agent.findMany({
    orderBy: [{ agent_id: 'asc' }, { version: 'desc' }],
    distinct: ['agent_id']
  });
}

function getAgent(agentId: number) {
  return prisma.agent.findFirst({
    where: { agent_id: agentId },
    orderBy: { version: 'desc' }
  });
}

async function updateAgent(agentId: number, agentData: Partial<CreateAgentDTO>) {
  const previousAgent = await getAgent(agentId);
  if (!previousAgent) {
    throw new Error('Agent not found');
  }

  return prisma.agent.create({
    data: {
      ...previousAgent,
      ...agentData,
      agent_id: agentId,
      version: previousAgent.version + 1
    }
  });

}

function deleteAgent(agentId: number) {
  return prisma.agent.deleteMany({
    where: { agent_id: agentId }
  });
}

// Export as a single object for cleaner imports
export default {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent
};