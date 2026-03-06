import { prisma } from '../database.js';

// ─── McpServer ────────────────────────────────────────────────────────────────

function upsertMcpServer(configId: string) {
  return prisma.mcpServer.upsert({
    where: { config_id: configId },
    create: { config_id: configId },
    update: {},
  });
}

function getMcpServer(configId: string) {
  return prisma.mcpServer.findUnique({ where: { config_id: configId } });
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

function upsertTool(data: {
  id: string;
  name: string;
  description: string;
  source: string;
  mcp_server_id?: number | null;
  locked_tier?: number | null;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
}) {
  return prisma.tool.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      name: data.name,
      description: data.description,
      source: data.source,
      mcp_server_id: data.mcp_server_id ?? null,
      locked_tier: data.locked_tier ?? null,
      input_schema: data.input_schema as any,
      output_schema: (data.output_schema ?? null) as any,
    },
    update: {
      name: data.name,
      description: data.description,
      input_schema: data.input_schema as any,
      output_schema: (data.output_schema ?? null) as any,
    },
  });
}

function getTool(id: string) {
  return prisma.tool.findUnique({
    where: { id },
    include: { mcp_server: true },
  });
}

function getToolById(toolId: number) {
  return prisma.tool.findUnique({
    where: { tool_id: toolId },
    include: { mcp_server: true },
  });
}

function listTools(source?: string) {
  return prisma.tool.findMany({
    where: source ? { source } : undefined,
    include: { mcp_server: true },
  });
}

/**
 * Keyword search across tool name and description.
 * Returns tools ordered by relevance (name matches ranked above description matches).
 */
async function searchToolsByKeyword(query: string, limit: number = 5): Promise<typeof prisma.tool.findMany extends (...args: any[]) => Promise<infer R> ? R : never> {
  const lower = query.toLowerCase();

  const all = await prisma.tool.findMany({
    include: { mcp_server: true },
  });

  // Score: name match = 2, description match = 1
  const scored = all
    .map(t => ({
      tool: t,
      score:
        (t.name.toLowerCase().includes(lower) ? 2 : 0) +
        (t.description.toLowerCase().includes(lower) ? 1 : 0),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.tool);

  return scored as any;
}

/**
 * Returns every tool in the registry with the given agent's assignment status
 * resolved via a single query. Built-in tools are always considered assigned
 * at Tier 3 (locked). All other tools use the AgentTool record if one exists,
 * otherwise default to assigned=false, tier=1.
 */
async function viewAgentTools(agentId: number) {
  const tools = await prisma.tool.findMany({
    include: {
      mcp_server: true,
      agent_tools: {
        where: { agent_id: agentId },
        take: 1,
      },
    },
    orderBy: [
      { source: 'asc' },
      { name: 'asc' },
    ],
  });

  return tools.map((tool) => {
    const assignment = tool.agent_tools[0] ?? null;
    const isBuiltin = tool.source === 'built-in';

    return {
      tool_id: tool.tool_id,
      id: tool.id,
      name: tool.name,
      description: tool.description,
      source: tool.source,
      mcp_server: tool.mcp_server ? { config_id: tool.mcp_server.config_id } : null,
      assigned: isBuiltin ? true : assignment !== null,
      tier: (isBuiltin ? 3 : (assignment?.tier ?? 1)) as 1 | 2 | 3,
      locked_tier: isBuiltin ? 3 : null,
    };
  });
}

function deleteToolsByMcpServer(mcpServerId: number) {
  return prisma.tool.deleteMany({ where: { mcp_server_id: mcpServerId } });
}

const ToolDao = {
  upsertMcpServer,
  getMcpServer,
  upsertTool,
  getTool,
  getToolById,
  listTools,
  viewAgentTools,
  searchToolsByKeyword,
  deleteToolsByMcpServer,
};

export default ToolDao;
