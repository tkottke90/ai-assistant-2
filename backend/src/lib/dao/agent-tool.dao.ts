import { prisma } from '../database.js';

function getAgentTool(agentId: number, toolId: number) {
  return prisma.agentTool.findUnique({
    where: { agent_id_tool_id: { agent_id: agentId, tool_id: toolId } },
    include: { tool: { include: { mcp_server: true } } },
  });
}

function listAgentTools(agentId: number) {
  return prisma.agentTool.findMany({
    where: { agent_id: agentId },
    include: { tool: { include: { mcp_server: true } } },
  });
}

function upsertAgentTool(agentId: number, toolId: number, tier: number = 1) {
  return prisma.agentTool.upsert({
    where: { agent_id_tool_id: { agent_id: agentId, tool_id: toolId } },
    create: { agent_id: agentId, tool_id: toolId, tier },
    update: { tier },
    include: { tool: { include: { mcp_server: true } } },
  });
}

function deleteAgentTool(agentId: number, toolId: number) {
  return prisma.agentTool.delete({
    where: { agent_id_tool_id: { agent_id: agentId, tool_id: toolId } },
  });
}

function deleteAllAgentTools(agentId: number) {
  return prisma.agentTool.deleteMany({ where: { agent_id: agentId } });
}

const AgentToolDao = {
  getAgentTool,
  listAgentTools,
  upsertAgentTool,
  deleteAgentTool,
  deleteAllAgentTools,
};

export default AgentToolDao;
