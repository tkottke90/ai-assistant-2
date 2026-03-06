import { createClientMethod } from '../client';
import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ToolSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  danger_level: z.enum(['low', 'medium', 'high']),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const ToolManifestSchema = ToolSummarySchema.extend({
  capabilities: z.array(z.string()),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()).nullable(),
});

export const AgentToolSchema = z.object({
  id: z.number(),
  agent_id: z.number(),
  tool_id: z.number(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  tool: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    source: z.string(),
    locked_tier: z.number().nullable(),
    mcp_server: z.object({ config_id: z.string() }).nullable(),
  }),
});

export const AgentToolViewSchema = z.object({
  tool_id: z.number(),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.string(),
  mcp_server: z.object({ config_id: z.string() }).nullable(),
  assigned: z.boolean(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  locked_tier: z.number().nullable(),
});

export const AgentActionSchema = z.object({
  action_id: z.number(),
  id: z.string(),
  agent_id: z.number(),
  thread_id: z.string(),
  description: z.string(),
  status: z.enum(['Pending', 'Approved', 'Denied', 'InProgress', 'Completed']),
  justification: z.string().nullable(),
  auto_approved: z.boolean(),
  expires_at: z.coerce.date(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const McpStatusSchema = z.record(
  z.string(),
  z.enum(['connecting', 'connected', 'error', 'disconnected'])
);

export type ToolSummary = z.infer<typeof ToolSummarySchema>;
export type ToolManifest = z.infer<typeof ToolManifestSchema>;
export type AgentTool = z.infer<typeof AgentToolSchema>;
export type AgentToolView = z.infer<typeof AgentToolViewSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type McpStatus = z.infer<typeof McpStatusSchema>;

// ─── API methods ──────────────────────────────────────────────────────────────

/** View all tools with resolved assignment status for an agent (single query) */
export const viewAgentTools = createClientMethod(
  '/api/v1/tools/agent/:agentId/view',
  { method: 'get', inputSchema: z.object({ agentId: z.number() }) },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch agent tool view');
    return z.array(AgentToolViewSchema).parse(await response.json());
  }
);

/** List all AgentTool assignments for an agent */
export const getAgentTools = createClientMethod(
  '/api/v1/tools/agent/:agentId',
  { method: 'get', inputSchema: z.object({ agentId: z.number() }) },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch agent tools');
    return z.array(AgentToolSchema).parse(await response.json());
  }
);

/** Upsert an AgentTool assignment (add tool to agent or change tier) */
export const upsertAgentTool = createClientMethod(
  '/api/v1/tools/agent/:agentId',
  {
    method: 'put',
    inputSchema: z.object({
      agentId: z.number(),
      tool_id: z.number(),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
    }),
  },
  async (response) => {
    if (!response.ok) throw new Error('Failed to upsert agent tool');
    return AgentToolSchema.parse(await response.json());
  }
);

/** Remove a tool assignment from an agent */
export const removeAgentTool = createClientMethod(
  '/api/v1/tools/agent/:agentId/:toolId',
  {
    method: 'delete',
    inputSchema: z.object({ agentId: z.number(), toolId: z.number() }),
  },
);

/** Get full tool manifest by namespaced ID */
export const getToolManifest = createClientMethod(
  '/api/v1/tools/:id',
  {
    method: 'get',
    inputSchema: z.object({ id: z.string(), agent_id: z.number().optional() }),
  },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch tool manifest');
    return ToolManifestSchema.parse(await response.json());
  }
);

/** Search the tool registry */
export const searchTools = createClientMethod(
  '/api/v1/tools/search',
  {
    method: 'post',
    inputSchema: z.object({ query: z.string(), agent_id: z.number() }),
  },
  async (response) => {
    if (!response.ok) throw new Error('Failed to search tools');
    return z.array(ToolSummarySchema).parse(await response.json());
  }
);

/** List all pending AgentActions for an agent */
export const listPendingActions = createClientMethod(
  '/api/v1/tools/actions',
  { method: 'get', inputSchema: z.object({ agentId: z.number() }) },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch pending actions');
    return z.array(AgentActionSchema).parse(await response.json());
  }
);

/** Get a specific AgentAction by UUID */
export const getAgentAction = createClientMethod(
  '/api/v1/tools/actions/:id',
  { method: 'get', inputSchema: z.object({ id: z.string() }) },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch agent action');
    return AgentActionSchema.parse(await response.json());
  }
);

/** Approve or deny a pending AgentAction */
export const resolveAgentAction = createClientMethod(
  '/api/v1/tools/actions/:id',
  {
    method: 'patch',
    inputSchema: z.object({
      id: z.string(),
      status: z.enum(['Approved', 'Denied']),
      justification: z.string().optional(),
    }),
  },
  async (response) => {
    if (!response.ok) throw new Error('Failed to resolve agent action');
    return AgentActionSchema.parse(await response.json());
  }
);

/** Get MCP server connection statuses */
export const getMcpStatus = createClientMethod(
  '/api/v1/tools/mcp/status',
  { method: 'get' },
  async (response) => {
    if (!response.ok) throw new Error('Failed to fetch MCP status');
    return McpStatusSchema.parse(await response.json());
  }
);
