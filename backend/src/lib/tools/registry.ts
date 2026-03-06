import ToolDao from '../dao/tool.dao.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import type { ToolSummary, ToolManifest, PermissionTier } from './models.js';

/**
 * Resolves the effective tier for a tool/agent pair.
 *
 * Resolution order:
 *   1. `tool.locked_tier` — set on built-in tools; the user cannot override this.
 *   2. `agentTool.tier`   — the tier the user assigned to this tool for this agent.
 *   3. `1` (Tier 1)       — the implicit default when no AgentTool row exists yet.
 *
 * Defaulting to Tier 1 for unassigned tools is **intentional**. It means agents can call
 * `request_permission` for any tool in the registry — not just tools explicitly assigned in
 * the UI. This lets the agent surface capability gaps ("I need tool X") that the user can
 * then acknowledge by assigning and promoting the tool's tier. All such requests still require
 * explicit user approval because Tier 1 always gates execution.
 *
 * Callers are expected to pass `agentTool?.tier ?? 1` when the AgentTool row may be absent.
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
