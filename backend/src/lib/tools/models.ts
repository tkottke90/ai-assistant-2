/**
 * Domain types for the Tool Discovery & Permission System.
 * These are plain TypeScript types — not Prisma models — used across
 * the ToolManager, built-in tools, DAOs, and API controllers.
 */

// ─── Registry types ──────────────────────────────────────────────────────────

export type DangerLevel = 'low' | 'medium' | 'high';
export type PermissionTier = 1 | 2 | 3;
export type ToolSource = 'built-in' | 'simple' | 'mcp';

/**
 * Lightweight summary returned by discover_tools.
 * Just enough for the agent to decide whether to inspect further.
 */
export interface ToolSummary {
  id: string;
  name: string;
  description: string;
  danger_level: DangerLevel;
  /** Agent's effective permission tier for this tool */
  tier: PermissionTier;
}

/**
 * Full manifest returned by get_tool_details.
 * Used by agents to author specific permission requests.
 */
export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  danger_level: DangerLevel;
  /** Agent's effective permission tier for this tool */
  tier: PermissionTier;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown> | null;
}

// ─── Execution types ─────────────────────────────────────────────────────────

/**
 * Single tool call — v1 always appears as a single-item ToolCallBatch.
 */
export interface ToolCall {
  tool_id: string;
  params: Record<string, unknown>;
}

/** v1: always a single-item array */
export type ToolCallBatch = ToolCall[];

export interface ToolResult {
  tool_id: string;
  data: unknown;
  error?: string;
}

// ─── AgentAction types ───────────────────────────────────────────────────────

export type ActionStatus =
  | 'Pending'
  | 'Approved'
  | 'Denied'
  | 'InProgress'
  | 'Completed';

// ─── MCP server runtime types ────────────────────────────────────────────────

export type McpServerStatus =
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

export interface McpServerRuntimeState {
  config_id: string;
  status: McpServerStatus;
  last_error: string | null;
  connected_at: Date | null;
}
