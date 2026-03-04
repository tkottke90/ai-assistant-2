import { Application } from 'express';
import { seedBuiltinTools } from './builtin/index.js';
import { createBuiltinTools } from './builtin/tools.js';
import { loadSimpleTools } from './simple/loader.js';
import { McpServerManager } from './mcp/manager.js';
import AgentToolDao from '../dao/agent-tool.dao.js';
import { createMemoryTools } from './builtin/memory-tools.js';
import type { StructuredTool } from '@langchain/core/tools';
import type { McpServerStatus } from './models.js';
import type { Logger } from 'winston';
import type { ToolsConfig } from '../config/tools.schema.js';
import path from 'node:path';

/**
 * Central service for tool loading, registry access, and per-agent tool resolution.
 * Attached to `app.tools` at startup (after LLMs, before AgentManager).
 *
 * Startup order: config → logger → llm → tools → agents → controllers
 */
export class ToolManager {
  /** All currently loaded LangChain tools by namespaced ID */
  private activeTools = new Map<string, StructuredTool>();
  private mcpManager: McpServerManager;
  private toolsConfig!: ToolsConfig;

  constructor(
    private readonly logger: Logger,
    readonly mcp: McpServerManager
  ) {
    this.mcpManager = mcp;
  }

  /**
   * Full startup sequence.
   * Failures in any individual tool or server do not abort startup.
   */
  async init(config: ToolsConfig, configDir: string): Promise<void> {
    this.logger.info('Initializing ToolManager');
    this.toolsConfig = config;

    await this.loadBuiltinTools();
    await this.loadSimpleToolsFromConfig(config, configDir);
    await this.loadMcpToolsFromConfig(config);
  }

  private async loadBuiltinTools(): Promise<void> {
    await seedBuiltinTools(this.logger);
    this.logger.debug('Built-in tool records seeded');
  }

  private async loadSimpleToolsFromConfig(config: ToolsConfig, configDir: string): Promise<void> {
    if (!config.simple?.length) return;

    const tools = await loadSimpleTools(config.simple, configDir, this.logger);
    for (const [id, tool] of tools) {
      this.activeTools.set(id, tool);
    }
    this.logger.info(`Simple tools loaded: ${tools.size}`);
  }

  private async loadMcpToolsFromConfig(config: ToolsConfig): Promise<void> {
    if (!config.mcp_servers?.length) return;

    const tools = await this.mcpManager.init(config.mcp_servers);
    for (const [id, tool] of tools) {
      this.activeTools.set(id, tool);
    }
    this.logger.info(`MCP tools loaded: ${tools.size}`);

    // Start the health check / reconnect loop for servers that failed at startup
    this.mcpManager.startHealthCheck((reconnectedTools) => {
      for (const [id, tool] of reconnectedTools) {
        this.activeTools.set(id, tool);
      }
      this.logger.info(`MCP tools restored after reconnect: ${reconnectedTools.size}`);
    });
  }

  /**
   * Returns the MCP server status for a given config_id.
   */
  getServerStatus(configId: string): McpServerStatus {
    return this.mcpManager.getStatus(configId);
  }

  /**
   * Returns all MCP server statuses keyed by config_id.
   */
  getAllMcpStatuses(): Record<string, McpServerStatus> {
    return this.mcpManager.getAllStatuses();
  }

  /**
   * Looks up an active LangChain tool by its namespaced ID.
   */
  getActiveTool(id: string): StructuredTool | undefined {
    return this.activeTools.get(id);
  }

  /**
   * Returns the five built-in permission-system tools + memory tools for an agent.
   * Always injected into every agent regardless of AgentTool assignments.
   */
  getBuiltinTools(agentId: number): StructuredTool[] {
    const config = this.toolsConfig;
    const permissionTools = createBuiltinTools({
      agentId,
      getActiveTool: (id) => this.getActiveTool(id),
      getServerStatus: (configId) => this.getServerStatus(configId),
      permissionTtlSeconds: config.permission_request_ttl_seconds,
      maxResults: config.discovery_max_results,
      keywordMinResults: config.discovery_keyword_min_results,
    });

    const memoryTools = createMemoryTools(agentId);

    return [...permissionTools, ...memoryTools as StructuredTool[]];
  }

  /**
   * Resolves all assigned tools for an agent into executable LangChain tools.
   * Excludes tools from disconnected MCP servers.
   */
  async getToolsForAgent(agentId: number): Promise<StructuredTool[]> {
    const agentTools = await AgentToolDao.listAgentTools(agentId);
    const tools: StructuredTool[] = [];

    for (const at of agentTools) {
      const t = this.activeTools.get(at.tool.id);
      if (!t) continue;

      // Skip tools from disconnected MCP servers
      if (at.tool.source === 'mcp' && at.tool.mcp_server) {
        const status = this.getServerStatus((at.tool as any).mcp_server.config_id);
        if (status !== 'connected') continue;
      }

      tools.push(t);
    }

    return tools;
  }

  async shutdown(): Promise<void> {
    await this.mcpManager.close();
  }
}

/**
 * Initialises the ToolManager service and attaches it to `app.tools`.
 */
export default async function setupTools(app: Application): Promise<void> {
  const toolsConfig = app.config.loadConfig('tools', (await import('../config/tools.schema.js')).ToolsConfigSchema);
  const configDir = path.resolve(process.env.CONFIG_DIR || '~/config/ai-assistant');

  const logger = app.logger.child({ location: 'ToolManager' });
  const mcpManager = new McpServerManager(logger.child({ location: 'McpServerManager' }));
  const manager = new ToolManager(logger, mcpManager);

  await manager.init(toolsConfig, configDir);

  app.tools = manager;
}
