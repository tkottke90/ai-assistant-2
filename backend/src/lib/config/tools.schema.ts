import { z } from 'zod';

const SimpleToolConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  /** Path to the bundled JS file, relative to CONFIG_DIR */
  path: z.string().min(1),
  /** Runtime to execute the tool in — only "node" is supported in v1 */
  runtime: z.enum(['node']).default('node'),
  /** Arbitrary config passed to the create(config) factory at load time */
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.enum(['stdio', 'http']),
  /** For stdio transport */
  command: z.string().optional(),
  /** For stdio transport */
  args: z.array(z.string()).optional(),
  /** For http transport */
  url: z.string().url().optional(),
  /** Environment variables passed to the MCP server process (stdio only) */
  env: z.record(z.string(), z.string()).optional().default({}),
});

export const ToolsConfigSchema = z.object({
  simple: z.array(SimpleToolConfigSchema).optional().default([]),
  mcp_servers: z.array(McpServerConfigSchema).optional().default([]),
  /** How long (seconds) a Pending AgentAction can remain unresolved before auto-denial on next read */
  permission_request_ttl_seconds: z.number().int().positive().default(900),
  /** Maximum tools returned by discover_tools */
  discovery_max_results: z.number().int().positive().default(5),
  /** Fall back to semantic search if keyword results are below this threshold */
  discovery_keyword_min_results: z.number().int().positive().default(2),
}).default({
  simple: [],
  mcp_servers: [],
  permission_request_ttl_seconds: 900,
  discovery_max_results: 5,
  discovery_keyword_min_results: 2,
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type SimpleToolConfig = z.infer<typeof SimpleToolConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
