import path from 'node:path';
import fs from 'node:fs';
import z from 'zod';
import type { SimpleToolConfig } from '../../config/tools.schema.js';
import ToolDao from '../../dao/tool.dao.js';
import type { StructuredTool } from '@langchain/core/tools';
import type { Logger } from 'winston';

/**
 * Loads a single simple tool from a bundled JS file.
 * Validates the module exports a default `create(config)` function
 * that returns a LangChain StructuredTool.
 *
 * Failures are logged and skipped — they do not crash startup.
 *
 * @returns The loaded LangChain tool, or null on failure
 */
async function loadSimpleTool(
  config: SimpleToolConfig,
  configDir: string,
  logger: Logger
): Promise<StructuredTool | null> {
  const toolPath = path.resolve(configDir, config.path);

  if (!fs.existsSync(toolPath)) {
    logger.error(
      `Simple tool "${config.id}" — file not found at ${toolPath}. Skipping.`
    );
    return null;
  }

  let mod: any;
  try {
    mod = await import(toolPath);
  } catch (err: any) {
    logger.error(
      `Simple tool "${config.id}" — invalid module: ${err?.message}. Skipping.`
    );
    return null;
  }

  const factory = mod?.default;
  if (typeof factory !== 'function') {
    logger.error(
      `Simple tool "${config.id}" — invalid module (missing default export). Skipping.`
    );
    return null;
  }

  let toolInstance: StructuredTool;
  try {
    toolInstance = factory(config.config ?? {});
  } catch (err: any) {
    logger.error(
      `Simple tool "${config.id}" — create() failed: ${err?.message}. Skipping.`
    );
    return null;
  }

  if (!toolInstance?.name || typeof toolInstance.invoke !== 'function') {
    logger.error(
      `Simple tool "${config.id}" — create() did not return a valid LangChain tool. Skipping.`
    );
    return null;
  }

  return toolInstance;
}

/**
 * Loads all configured simple tools and upserts their Tool records into the DB.
 *
 * @returns Map of namespaced tool ID → LangChain StructuredTool
 */
export async function loadSimpleTools(
  configs: SimpleToolConfig[],
  configDir: string,
  logger: Logger
): Promise<Map<string, StructuredTool>> {
  const loaded = new Map<string, StructuredTool>();

  for (const config of configs) {
    const tool = await loadSimpleTool(config, configDir, logger);
    if (!tool) continue;

    const namespacedId = `simple::${config.id}`;

    // Upsert the Tool record so it appears in the registry
    let input_schema: Record<string, unknown> = {};
    if (tool.schema) {
      try {
        // tool.schema is typed as Zod v3 by LangChain but is a Zod v4 schema at runtime
        input_schema = z.toJSONSchema(tool.schema as any) as Record<string, unknown>;
      } catch (err: any) {
        logger.warn(`Simple tool "${config.id}" — could not convert schema to JSON Schema: ${err?.message}`);
      }
    }

    await ToolDao.upsertTool({
      id: namespacedId,
      name: tool.name,
      description: tool.description ?? config.description,
      source: 'simple',
      input_schema,
      output_schema: null,
    });

    loaded.set(namespacedId, tool);
    logger.debug(`Simple tool loaded: ${namespacedId}`);
  }

  return loaded;
}
