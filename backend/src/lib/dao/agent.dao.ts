import { AgentSchema, CreateAgentDTO } from '../models/agent.js';
import { prisma } from '../database.js';
import { PaginationQuery, PaginatedResponse, createPagination } from '../types/pagination.js';

function createAgent(agentData: CreateAgentDTO) {
  return prisma.agent.create({
    data: agentData
  });
}

function countAgents() {
  return prisma.agent.count();
}

async function listAgents(paginationQuery?: Partial<PaginationQuery>) {
  const { page, take, skip } = paginationQuery ?? {};
  
  // Get total count of unique agents
  const totalCount = await prisma.agent.groupBy({
    by: ['agent_id'],
    _count: true
  }).then(results => results.length);

  // Get paginated agents (latest version only)
  const agents = await prisma.agent.findMany({
    skip,
    take,
    orderBy: [{ agent_id: 'asc' }, { version: 'desc' }],
    distinct: ['agent_id']
  });

  return {
    pagination: createPagination(page ?? 1, totalCount, take ?? totalCount),
    data: agents
  };
}

async function getAllAgents() {
  const agents = await prisma.agent.findMany({
    orderBy: [{ agent_id: 'asc' }, { version: 'desc' }],
    distinct: ['agent_id']
  });

  return agents.map(agent => AgentSchema.parse(agent));
}

function getAgent(agentId: number) {
  return prisma.agent.findFirst({
    where: { agent_id: agentId },
    orderBy: { version: 'desc' }
  });
}

function getAutoStartAgents() {
  return prisma.agent.findMany({
    where: { auto_start: true },
    orderBy: [{ agent_id: 'asc' }, { version: 'desc' }],
    distinct: ['agent_id']
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
  countAgents,
  listAgents,
  getAllAgents,
  getAgent,
  getAutoStartAgents,
  updateAgent,
  deleteAgent
};