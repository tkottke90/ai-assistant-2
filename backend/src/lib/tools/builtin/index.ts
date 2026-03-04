import ToolDao from '../../dao/tool.dao.js';
import type { StructuredTool } from '@langchain/core/tools';
import type { Logger } from 'winston';

/** Namespaced IDs for the five built-in tools */
export const BUILTIN_IDS = {
  DISCOVER_TOOLS: 'built-in::discover_tools',
  GET_TOOL_DETAILS: 'built-in::get_tool_details',
  REQUEST_PERMISSION: 'built-in::request_permission',
  EXECUTE_ACTION: 'built-in::execute_action',
  EXECUTE_TOOL: 'built-in::execute_tool',
} as const;

interface BuiltinSeedEntry {
  id: string;
  name: string;
  description: string;
  locked_tier: number;
  input_schema: Record<string, unknown>;
}

const BUILTIN_SEEDS: BuiltinSeedEntry[] = [
  {
    id: BUILTIN_IDS.DISCOVER_TOOLS,
    name: 'discover_tools',
    description:
      'Search the tool registry for tools relevant to the current task. ' +
      'Returns lightweight summaries. Tier 2/3 tools always appear; Tier 1 tools appear only on match.',
    locked_tier: 3,
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Natural language search query' } },
      required: ['query'],
    },
  },
  {
    id: BUILTIN_IDS.GET_TOOL_DETAILS,
    name: 'get_tool_details',
    description:
      'Get full details (input/output schema, capabilities) for a specific tool. ' +
      'Use before requesting permission to understand exactly what the tool does.',
    locked_tier: 3,
    input_schema: {
      type: 'object',
      properties: { tool_id: { type: 'string', description: 'Namespaced tool identifier' } },
      required: ['tool_id'],
    },
  },
  {
    id: BUILTIN_IDS.REQUEST_PERMISSION,
    name: 'request_permission',
    description:
      'Request user approval to use a Tier 1 tool. Creates a pending permission request visible to the user. ' +
      'The agent suspends until the user approves or denies.',
    locked_tier: 3,
    input_schema: {
      type: 'object',
      properties: {
        tool_id: { type: 'string' },
        description: { type: 'string', description: 'Agent-authored goal statement shown to the user' },
        action: { type: 'array', items: { type: 'object' }, description: 'ToolCallBatch — v1: single-item array' },
      },
      required: ['tool_id', 'description', 'action'],
    },
  },
  {
    id: BUILTIN_IDS.EXECUTE_ACTION,
    name: 'execute_action',
    description:
      'Execute an approved AgentAction by its ID. ' +
      'Returns the original description (to restore context) and the tool results.',
    locked_tier: 3,
    input_schema: {
      type: 'object',
      properties: { action_id: { type: 'string', description: 'UUID of the approved AgentAction' } },
      required: ['action_id'],
    },
  },
  {
    id: BUILTIN_IDS.EXECUTE_TOOL,
    name: 'execute_tool',
    description:
      'Execute a Tier 2 or Tier 3 tool directly without requesting permission. ' +
      'Fails immediately if the tool is Tier 1 for this agent.',
    locked_tier: 3,
    input_schema: {
      type: 'object',
      properties: {
        tool_id: { type: 'string' },
        params: { type: 'object', description: 'Parameters matching the tool input schema' },
      },
      required: ['tool_id', 'params'],
    },
  },
];

/**
 * Upserts the five built-in Tool records into the database at startup.
 * Safe to call on every startup — upsert is idempotent.
 */
export async function seedBuiltinTools(logger: Logger): Promise<void> {
  for (const entry of BUILTIN_SEEDS) {
    await ToolDao.upsertTool({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      source: 'built-in',
      locked_tier: entry.locked_tier,
      input_schema: entry.input_schema,
      output_schema: null,
    });
    logger.debug(`Built-in tool seeded: ${entry.id}`);
  }
}
