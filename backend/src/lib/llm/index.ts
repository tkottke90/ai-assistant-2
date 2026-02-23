import { Application } from "express";
import { LlmConfigSchema } from '../config/llm.schema.js';
import { createOllamaClient } from "./ollama.js";
import { createOpenAIClient } from "./openai.js";


export function initializeLLMs(app: Application) {
  const llmConfig = app.config.loadConfig('llm', LlmConfigSchema);

  app.llm = {};

  for (const apiConfig of llmConfig.apis) {
    switch (apiConfig.provider) {
      case 'openai':
        app.logger.debug(`Initializing OpenAI API client for alias: ${apiConfig.alias} [${apiConfig.location}]`);

        app.llm[apiConfig.alias] = createOpenAIClient(apiConfig);
        break;
      case 'ollama':
        app.logger.debug(`Initializing Ollama API client for alias: ${apiConfig.alias} [${apiConfig.location}]`);
        
        app.llm[apiConfig.alias] = createOllamaClient(apiConfig);
        break;
      default:
        app.logger.warn(`Unsupported LLM provider: ${apiConfig.provider}`);
        continue;
    }
  }
}
