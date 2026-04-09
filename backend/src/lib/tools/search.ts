import ToolDao from '../dao/tool.dao.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import { resolveEffectiveTier } from './registry.js';
import type { ToolSummary, McpServerStatus } from './models.js';

/**
 * Discovers all tools available to an agent, regardless of permission tier.
 * All tools are always returned so agents can decide the correct execution path
 * (execute_tool for Tier 2/3, request_permission for Tier 1) based on the
 * `tier` field on each result.
 *
 * `query` is reserved for future semantic ranking and is not used for filtering.
 * `maxResults` caps results when provided (e.g. for paginated UI endpoints);
 * omit it to return all available tools (preferred for agent use).
 */
export async function discoverTools(
  query: string,
  agentId: number,
  getServerStatus: (configId: string) => McpServerStatus,
  maxResults?: number,
): Promise<ToolSummary[]> {
  const agentTools = await AgentToolDao.listAgentTools(agentId);
  const agentToolMap = new Map(agentTools.map(at => [at.tool_id, at]));

  const allTools = await ToolDao.listTools();

  // Filter out tools from disconnected MCP servers
  const availableTools = allTools.filter(t => {
    if (t.source !== 'mcp' || !t.mcp_server) return true;
    const status = getServerStatus(t.mcp_server.config_id);
    return status === 'connected';
  });

  const results: ToolSummary[] = availableTools.map(tool => {
    const agentTool = agentToolMap.get(tool.tool_id);
    const tier = resolveEffectiveTier(tool.locked_tier, agentTool?.tier ?? 1);
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      danger_level: 'low',
      tier,
    };
  });

  return maxResults !== undefined ? results.slice(0, maxResults) : results;
}
