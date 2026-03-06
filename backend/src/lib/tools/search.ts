import ToolDao from '../dao/tool.dao.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import { resolveEffectiveTier } from './registry.js';
import type { ToolSummary, McpServerStatus } from './models.js';

/**
 * Two-pass discovery search:
 *  1. Keyword match against tool name + description
 *  2. (Stub) Semantic fallback — hook for embedding search when a vector store is available
 *
 * Visibility rules per the permission tier design:
 *  - Tier 2/3 tools always appear regardless of query match
 *  - Tier 1 tools appear only when the keyword or semantic search matches
 *
 * Results are capped at `maxResults`.
 */
export async function discoverTools(
  query: string,
  agentId: number,
  maxResults: number,
  keywordMinResults: number,
  getServerStatus: (configId: string) => McpServerStatus,
): Promise<ToolSummary[]> {
  const agentTools = await AgentToolDao.listAgentTools(agentId);
  const agentToolMap = new Map(agentTools.map(at => [at.tool_id, at]));

  // Fetch all tools assigned to this agent (all tiers)
  const allTools = await ToolDao.listTools();
  // Only tools assigned to the agent OR built-in (always available)
  const candidateTools = allTools.filter(t =>
    t.source === 'built-in' || agentToolMap.has(t.tool_id)
  );

  // Filter out tools from disconnected MCP servers
  const availableTools = candidateTools.filter(t => {
    if (t.source !== 'mcp' || !t.mcp_server) return true;
    const status = getServerStatus(t.mcp_server.config_id);
    return status === 'connected';
  });

  const lower = query.toLowerCase();

  const results: ToolSummary[] = [];
  const keywordMatches: ToolSummary[] = [];

  for (const tool of availableTools) {
    const agentTool = agentToolMap.get(tool.tool_id);
    const tier = resolveEffectiveTier(tool.locked_tier, agentTool?.tier ?? 1);

    const summary: ToolSummary = {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      danger_level: 'low',
      tier,
    };

    // Tier 2/3 always appear
    if (tier >= 2) {
      results.push(summary);
      continue;
    }

    // Tier 1 only on keyword match
    const nameMatch = tool.name.toLowerCase().includes(lower);
    const descMatch = tool.description.toLowerCase().includes(lower);
    if (nameMatch || descMatch) {
      keywordMatches.push(summary);
    }
  }

  // Merge keyword matches into results (avoid duplicates)
  const seen = new Set(results.map(r => r.id));
  for (const s of keywordMatches) {
    if (!seen.has(s.id)) {
      results.push(s);
      seen.add(s.id);
    }
  }

  // Semantic fallback stub — if keyword results are sparse, a future embedding
  // search can be added here by checking keywordMatches.length < keywordMinResults
  // and calling an embeddings store.

  return results.slice(0, maxResults);
}
