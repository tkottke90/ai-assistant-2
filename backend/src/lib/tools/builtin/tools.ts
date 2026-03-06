import type { StructuredTool } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { getConfig, interrupt } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import AgentActionDao from '../../dao/agent-action.dao.js';
import CheckpointDao from '../../dao/checkpoint.dao.js';
import AgentToolDao from '../../dao/agent-tool.dao.js';
import ToolDao from '../../dao/tool.dao.js';
import { executeTool } from '../executor.js';
import type { McpServerStatus, ToolCallBatch } from '../models.js';
import { getToolManifest, resolveEffectiveTier } from '../registry.js';
import { discoverTools } from '../search.js';

export interface BuiltinToolContext {
  agentId: number;
  /** Looks up a currently loaded LangChain tool by namespaced ID */
  getActiveTool: (id: string) => StructuredTool | undefined;
  /** Returns the MCP server connection status */
  getServerStatus: (configId: string) => McpServerStatus;
  permissionTtlSeconds: number;
  maxResults: number;
  keywordMinResults: number;
}

/**
 * Creates the five built-in LangChain tools for the permission system.
 * These are always injected into every agent regardless of AgentTool assignments.
 */
export function createBuiltinTools(ctx: BuiltinToolContext): StructuredTool[] {
  const discoverToolsTool = tool(
    async ({ query }) => {
      const results = await discoverTools(
        query,
        ctx.agentId,
        ctx.maxResults,
        ctx.keywordMinResults,
        ctx.getServerStatus,
      );
      return JSON.stringify(results);
    },
    {
      name: 'discover_tools',
      description:
        'Search the tool registry for tools relevant to the current task. ' +
        'Tier 2/3 tools always appear; Tier 1 tools appear only on keyword match.',
      schema: z.object({
        query: z.string().describe('Natural language description of what you need to do'),
      }),
    }
  );

  const getToolDetailsTool = tool(
    async ({ tool_id }) => {
      const manifest = await getToolManifest(tool_id, ctx.agentId);
      if (!manifest) return JSON.stringify({ error: `Tool not found: ${tool_id}` });
      return JSON.stringify(manifest);
    },
    {
      name: 'get_tool_details',
      description:
        'Get full details (schema, capabilities) for a specific tool. ' +
        'Use this before requesting permission so you can write an accurate request.',
      schema: z.object({
        tool_id: z.string().describe('Namespaced tool identifier, e.g. "simple::web_search"'),
      }),
    }
  );

  const requestPermissionTool = tool(
    async ({ tool_id, description, action }) => {
      const config = getConfig();
      const threadId: string = (config?.configurable as any)?.thread_id ?? 'unknown';

      // Validate the tool exists and is Tier 1 for this agent
      const dbTool = await ToolDao.getTool(tool_id);
      if (!dbTool) return JSON.stringify({ error: `Tool not found: ${tool_id}` });

      const agentTool = await AgentToolDao.getAgentTool(ctx.agentId, dbTool.tool_id);
      const effectiveTier = resolveEffectiveTier(dbTool.locked_tier, agentTool?.tier ?? 1);

      if (effectiveTier !== 1) {
        return JSON.stringify({
          error: `Tool "${tool_id}" is Tier ${effectiveTier}. Use execute_tool directly.`,
        });
      }

      // Check per-turn denial block
      const userTurnCpId = await CheckpointDao.getUserTurnCheckpointId(threadId);
      const existingDenial = await AgentActionDao.findDeniedInTurn(
        ctx.agentId,
        threadId,
        tool_id,
        userTurnCpId
      );

      if (existingDenial) {
        const batch = existingDenial.action as unknown as ToolCallBatch;
        const denied = batch.some(c => c.tool_id === tool_id);
        if (denied) {
          return JSON.stringify({
            error: `Permission denied for "${tool_id}" in this turn. Try again in a new message.`,
          });
        }
      }

      const batch: ToolCallBatch = action as ToolCallBatch;
      const actionId = uuidv4();
      const expiresAt = new Date(Date.now() + ctx.permissionTtlSeconds * 1000);

      const agentAction = await AgentActionDao.createAgentAction({
        id: actionId,
        agent_id: ctx.agentId,
        thread_id: threadId,
        user_turn_checkpoint_id: userTurnCpId,
        description,
        action: batch,
        expires_at: expiresAt,
      });

      // Suspend the LangGraph loop — execution pauses here until resumed
      interrupt({
        action_id: agentAction.id,
        status: 'Pending',
        interrupt_type: 'permission_request',
      });

      // This line is reached only when the graph is resumed (e.g., in tests or non-graph calls)
      return JSON.stringify({ action_id: agentAction.id, status: 'Pending' });
    },
    {
      name: 'request_permission',
      description:
        'Request user approval to use a Tier 1 tool. Creates a pending request visible to the user. ' +
        'The agent suspends until the user approves or denies.',
      schema: z.object({
        tool_id: z.string().describe('Namespaced tool identifier'),
        description: z
          .string()
          .describe(
            'Agent-authored goal statement. Shown to user during review and fed back at execution time.'
          ),
        action: z
          .array(z.object({ tool_id: z.string(), params: z.record(z.string(), z.unknown()) }))
          .describe('ToolCallBatch — v1: always a single-item array'),
      }),
    }
  );

  const executeActionTool = tool(
    async ({ action_id }) => {
      const agentAction = await AgentActionDao.getAgentAction(action_id);
      if (!agentAction) return JSON.stringify({ error: `AgentAction not found: ${action_id}` });

      if (agentAction.status !== 'Approved') {
        return JSON.stringify({
          error: `Cannot execute action with status: ${agentAction.status}`,
        });
      }

      // Mark as InProgress
      await AgentActionDao.updateAgentActionStatus(action_id, 'InProgress');

      const activeLangChainTools = new Map<string, StructuredTool>();
      const batch = agentAction.action as unknown as ToolCallBatch;

      for (const call of batch) {
        const t = ctx.getActiveTool(call.tool_id);
        if (t) activeLangChainTools.set(call.tool_id, t);
      }

      const results = await Promise.all(
        batch.map(call =>
          executeTool(call, ctx.agentId, activeLangChainTools, ctx.getServerStatus, action_id)
        )
      );

      await AgentActionDao.updateAgentActionStatus(action_id, 'Completed');

      return JSON.stringify({
        description: agentAction.description,
        results,
      });
    },
    {
      name: 'execute_action',
      description:
        'Execute an approved AgentAction by its ID. ' +
        'Returns the original description (to restore context) and the tool results.',
      schema: z.object({
        action_id: z.string().describe('UUID of the approved AgentAction'),
      }),
    }
  );

  const executeToolTool = tool(
    async ({ tool_id, params }) => {
      const dbTool = await ToolDao.getTool(tool_id);
      if (!dbTool) return JSON.stringify({ error: `Tool not found: ${tool_id}` });

      const agentTool = await AgentToolDao.getAgentTool(ctx.agentId, dbTool.tool_id);
      const effectiveTier = resolveEffectiveTier(dbTool.locked_tier, agentTool?.tier ?? 1);

      if (effectiveTier === 1) {
        return JSON.stringify({
          error: `Tool "${tool_id}" is Tier 1. Use request_permission first.`,
        });
      }

      const t = ctx.getActiveTool(tool_id);
      if (!t) return JSON.stringify({ error: `Tool "${tool_id}" is not currently loaded.` });

      const activeLangChainTools = new Map([[tool_id, t]]);
      const result = await executeTool(
        { tool_id, params },
        ctx.agentId,
        activeLangChainTools,
        ctx.getServerStatus,
      );
      return JSON.stringify(result);
    },
    {
      name: 'execute_tool',
      description:
        'Execute a Tier 2 or Tier 3 tool directly without requesting permission. ' +
        'Fails immediately if the tool is Tier 1.',
      schema: z.object({
        tool_id: z.string().describe('Namespaced tool identifier'),
        params: z
          .record(z.string(), z.unknown())
          .describe('Parameters matching the tool input schema'),
      }),
    }
  );

  return [
    discoverToolsTool as unknown as StructuredTool,
    getToolDetailsTool as unknown as StructuredTool,
    requestPermissionTool as unknown as StructuredTool,
    executeActionTool as unknown as StructuredTool,
    executeToolTool as unknown as StructuredTool,
  ];
}
