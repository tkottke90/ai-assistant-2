import { Router } from 'express';
import { LlmApiSchema, LlmConfigSchema } from '../../lib/config/llm.schema.js';
import z from 'zod';

export const router = Router();

const SafeLlmApiSchema = LlmApiSchema.omit({ apiKey: true });

/**
 * GET /api/v1/llm
 * Returns all configured LLM APIs. Credentials (apiKey) are never included.
 */
router.get('/', (req, res) => {
  const llmConfig = req.app.config.loadConfig('llm', LlmConfigSchema);

  res.json({
    apis: llmConfig.apis.map(api => SafeLlmApiSchema.parse(api))
  });
});

/**
 * GET /api/v1/llm/models?alias=<alias>
 * Returns the live list of models available for the given engine alias.
 * Uses apiKey server-side; only model name strings are sent to the client.
 */
router.get('/models', async (req, res) => {
  const { alias } = req.query as { alias?: string };
  const llmManager = req.app.llm;

  
  const llmConfig = req.app.config.loadConfig('llm', LlmConfigSchema);
  
  const api = alias
  ? llmConfig.apis.find(a => a.alias === alias)
  : llmConfig.apis[0];
  
  if (!api) {
    res.status(404).json({ error: `No LLM config found for alias '${alias}'` });
    return;
  }
  
  try {
    let models = await llmManager.listModels(api);

    res.json({ alias: api.alias, provider: api.provider, models });
  } catch (error: any) {
    req.logger.error('Failed to fetch models from provider', { alias: api.alias, error: error?.message });
    res.status(502).json({ error: `Failed to fetch models: ${error?.message}` });
  }
});

export default router;
