import ToolDao from '../dao/tool.dao.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import AgentActionDao from '../dao/agent-action.dao.js';
import { resolveEffectiveTier } from './registry.js';
import type { ToolCall, ToolResult } from './models.js';
import type { StructuredTool } from '@langchain/core/tools';
import { BadRequestError, NotFoundError } from '../errors/http.errors.js';

/**
 * Executes a single ToolCall with tier-aware access control.
 *
 * - Tier 1: requires an approved AgentAction. Validates action_hash for tamper detection.
 * - Tier 2/3: executes directly without a permission check.
 *
 * @param toolCall       The tool call to execute
 * @param agentId        The agent requesting execution
 * @param activeLangChainTools  Map of tool string ID → executable LangChain tool
 * @param getServerStatus Checks if an MCP server is connected
 * @param actionId       For Tier 1 — the approved AgentAction UUID
 */
export async function executeTool(
  toolCall: ToolCall,
  agentId: number,
  activeLangChainTools: Map<string, StructuredTool>,
  getServerStatus: (configId: string) => import('./models.js').McpServerStatus,
  actionId?: string,
): Promise<ToolResult> {
  const tool = await ToolDao.getTool(toolCall.tool_id);
  if (!tool) {
    throw new NotFoundError(`Tool not found: ${toolCall.tool_id}`);
  }

  // Check MCP server availability
  if (tool.source === 'mcp' && tool.mcp_server) {
    const status = getServerStatus(tool.mcp_server.config_id);
    if (status !== 'connected') {
      throw new BadRequestError(
        `Tool unavailable: ${toolCall.tool_id}. MCP server ${tool.mcp_server.config_id} is currently ${status}.`
      );
    }
  }

  const agentTool = await AgentToolDao.getAgentTool(agentId, tool.tool_id);
  const effectiveTier = resolveEffectiveTier(tool.locked_tier, agentTool?.tier ?? 1);

  if (effectiveTier === 1) {
    if (!actionId) {
      throw new BadRequestError(
        `Tool ${toolCall.tool_id} requires a permission grant. Use request_permission first.`
      );
    }

    const action = await AgentActionDao.getAgentAction(actionId);
    if (!action) throw new NotFoundError(`AgentAction not found: ${actionId}`);
    if (action.status !== 'Approved') {
      throw new BadRequestError(
        `Cannot execute action with status: ${action.status}`
      );
    }
  }

  const langChainTool = activeLangChainTools.get(toolCall.tool_id);
  if (!langChainTool) {
    throw new NotFoundError(
      `Executable tool not loaded for: ${toolCall.tool_id}. It may have failed to load at startup.`
    );
  }

  try {
    const data = await langChainTool.invoke(toolCall.params);
    return { tool_id: toolCall.tool_id, data };
  } catch (err: any) {
    return { tool_id: toolCall.tool_id, data: null, error: err?.message ?? String(err) };
  }
}
