import ToolDao from '../dao/tool.dao.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import type { ToolSummary, ToolManifest, PermissionTier } from './models.js';

/**
 * Resolves the effective tier for a tool/agent pair.
 * Built-in tools carry a locked_tier that the user cannot override.
 */
export function resolveEffectiveTier(
  lockedTier: number | null,
  agentTier: number
): PermissionTier {
  return ((lockedTier ?? agentTier) as PermissionTier);
}

/**
 * Looks up a tool by its namespaced string ID and returns a ToolManifest
 * with the agent's effective tier resolved.
 */
export async function getToolManifest(
  toolStringId: string,
  agentId: number
): Promise<ToolManifest | null> {
  const tool = await ToolDao.getTool(toolStringId);
  if (!tool) return null;

  const agentTool = await AgentToolDao.getAgentTool(agentId, tool.tool_id);
  const tier = resolveEffectiveTier(tool.locked_tier, agentTool?.tier ?? 1);

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    capabilities: [],  // v1: populated from input_schema capabilities field if present
    danger_level: 'low',
    tier,
    input_schema: tool.input_schema as Record<string, unknown>,
    output_schema: tool.output_schema as Record<string, unknown> | null,
  };
}

/**
 * Converts a DB tool row + agentTool record into a ToolSummary.
 */
export async function getToolSummary(
  toolStringId: string,
  agentId: number
): Promise<ToolSummary | null> {
  const manifest = await getToolManifest(toolStringId, agentId);
  if (!manifest) return null;

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    danger_level: manifest.danger_level,
    tier: manifest.tier,
  };
}
