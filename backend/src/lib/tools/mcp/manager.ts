import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { McpServerConfig } from '../../config/tools.schema.js';
import ToolDao from '../../dao/tool.dao.js';
import type { McpServerRuntimeState, McpServerStatus } from '../models.js';
import type { StructuredTool } from '@langchain/core/tools';
import type { Logger } from 'winston';

/**
 * Manages MCP server connections using @langchain/mcp-adapters MultiServerMCPClient.
 *
 * Runtime state (status, errors) is held in memory only — never persisted.
 * Every startup begins with all servers in the "connecting" state.
 *
 * The McpServer DB records are upserted for FK purposes only; tool loading
 * happens through MultiServerMCPClient.getTools() which returns LangChain-ready tools.
 */
export class McpServerManager {
  private client: MultiServerMCPClient | null = null;
  private states = new Map<string, McpServerRuntimeState>();
  private toolsByServer = new Map<string, StructuredTool[]>();
  /** Original configs retained for reconnect attempts */
  private configs: McpServerConfig[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly logger: Logger) {}

  /**
   * Connects to all configured MCP servers and upserts Tool records.
   * Failures are logged and skipped — startup continues.
   *
   * @returns Flat map of namespaced tool ID → LangChain StructuredTool
   */
  async init(
    configs: McpServerConfig[]
  ): Promise<Map<string, StructuredTool>> {
    if (configs.length === 0) {
      return new Map();
    }

    this.configs = configs;
    for (const cfg of configs) {
      this.states.set(cfg.id, {
        config_id: cfg.id,
        status: 'connecting',
        last_error: null,
        connected_at: null,
      });
    }

    // Build the MultiServerMCPClient config
    const clientConfig: Record<string, any> = {};
    for (const cfg of configs) {
      if (cfg.transport === 'stdio') {
        clientConfig[cfg.id] = {
          transport: 'stdio',
          command: cfg.command!,
          args: cfg.args ?? [],
          env: cfg.env ?? {},
        };
      } else {
        clientConfig[cfg.id] = {
          transport: 'http',
          url: cfg.url!,
        };
      }
    }

    this.client = new MultiServerMCPClient(clientConfig);

    // Connect — onConnectionError:"warn" so we don't throw on partial failure
    let serverTools: Record<string, any[]> = {};
    try {
      serverTools = await this.client.initializeConnections();
    } catch (err: any) {
      this.logger.error(`MCP: initializeConnections error: ${err?.message}`);
    }

    const allTools = new Map<string, StructuredTool>();

    for (const cfg of configs) {
      const tools: StructuredTool[] = serverTools[cfg.id] ?? [];

      if (tools.length === 0 && !(cfg.id in serverTools)) {
        // Server failed to connect
        const state = this.states.get(cfg.id)!;
        state.status = 'error';
        state.last_error = `Server did not connect or returned no tools`;
        this.logger.warn(`MCP server "${cfg.id}" — failed to connect. Will not have tools.`);
        continue;
      }

      // Upsert McpServer DB record (stable FK anchor)
      const dbServer = await ToolDao.upsertMcpServer(cfg.id);

      // Upsert each discovered tool into the DB registry
      for (const tool of tools) {
        const namespacedId = `mcp::${cfg.id}::${tool.name}`;
        await ToolDao.upsertTool({
          id: namespacedId,
          name: tool.name,
          description: tool.description ?? '',
          source: 'mcp',
          mcp_server_id: dbServer.server_id,
          input_schema: (tool.schema as any)?.shape ?? {},
          output_schema: null,
        });
        allTools.set(namespacedId, tool as StructuredTool);
      }

      this.toolsByServer.set(cfg.id, tools as StructuredTool[]);

      const state = this.states.get(cfg.id)!;
      state.status = 'connected';
      state.connected_at = new Date();

      this.logger.info(
        `MCP server "${cfg.id}" — connected, ${tools.length} tool(s) registered.`
      );
    }

    return allTools;
  }

  getStatus(configId: string): McpServerStatus {
    return this.states.get(configId)?.status ?? 'disconnected';
  }

  getAllStatuses(): Record<string, McpServerStatus> {
    const result: Record<string, McpServerStatus> = {};
    for (const [id, state] of this.states) {
      result[id] = state.status;
    }
    return result;
  }

  /**
   * Starts a periodic health check timer. Servers in `error` state are retried.
   * Call this once after successful init() to enable auto-reconnect.
   *
   * @param onReconnected Called with newly loaded tools when a server reconnects.
   *                      The ToolManager uses this to register the tools in its active map.
   * @param intervalMs    Poll interval in milliseconds (default: 30 000)
   */
  startHealthCheck(
    onReconnected: (tools: Map<string, StructuredTool>) => void,
    intervalMs = 30_000,
  ): void {
    if (this.healthCheckTimer) return; // already running

    this.healthCheckTimer = setInterval(async () => {
      const failedConfigs = this.configs.filter(cfg => {
        const status = this.states.get(cfg.id)?.status;
        return status === 'error' || status === 'disconnected';
      });

      if (failedConfigs.length === 0) return;

      this.logger.debug(`MCP health check: retrying ${failedConfigs.length} server(s)`);

      for (const cfg of failedConfigs) {
        const state = this.states.get(cfg.id);
        if (state) state.status = 'connecting';

        const tools = await this.attemptReconnect(cfg);
        if (tools.size > 0) onReconnected(tools);
      }
    }, intervalMs);
  }

  /** Attempts to connect to a single MCP server and register its tools. */
  private async attemptReconnect(cfg: McpServerConfig): Promise<Map<string, StructuredTool>> {
    const result = new Map<string, StructuredTool>();

    const singleConfig: Record<string, any> = {};
    if (cfg.transport === 'stdio') {
      singleConfig[cfg.id] = { transport: 'stdio', command: cfg.command!, args: cfg.args ?? [], env: cfg.env ?? {} };
    } else {
      singleConfig[cfg.id] = { transport: 'http', url: cfg.url! };
    }

    let serverTools: StructuredTool[] = [];
    try {
      const singleClient = new MultiServerMCPClient(singleConfig);
      const toolsMap = await singleClient.initializeConnections();
      serverTools = (toolsMap[cfg.id] ?? []) as StructuredTool[];
      await singleClient.close();
    } catch (err: any) {
      const state = this.states.get(cfg.id);
      if (state) { state.status = 'error'; state.last_error = err?.message ?? String(err); }
      this.logger.warn(`MCP reconnect failed for "${cfg.id}": ${err?.message}`);
      return result;
    }

    if (serverTools.length === 0) {
      const state = this.states.get(cfg.id);
      if (state) { state.status = 'error'; state.last_error = 'No tools returned after reconnect'; }
      return result;
    }

    const dbServer = await ToolDao.upsertMcpServer(cfg.id);
    for (const tool of serverTools) {
      const namespacedId = `mcp::${cfg.id}::${tool.name}`;
      await ToolDao.upsertTool({
        id: namespacedId,
        name: tool.name,
        description: tool.description ?? '',
        source: 'mcp',
        mcp_server_id: dbServer.server_id,
        input_schema: (tool.schema as any)?.shape ?? {},
        output_schema: null,
      });
      result.set(namespacedId, tool);
    }

    this.toolsByServer.set(cfg.id, serverTools);
    const state = this.states.get(cfg.id);
    if (state) { state.status = 'connected'; state.connected_at = new Date(); state.last_error = null; }
    this.logger.info(`MCP server "${cfg.id}" — reconnected, ${serverTools.length} tool(s) restored.`);
    return result;
  }

  async close() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.client) {
      await this.client.close();
      for (const state of this.states.values()) {
        state.status = 'disconnected';
      }
    }
  }
}
