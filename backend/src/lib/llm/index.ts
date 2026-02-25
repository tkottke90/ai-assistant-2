import { Application } from "express";
import { LlmConfig, LlmConfigSchema } from '../config/llm.schema.js';
import { createOllamaClient } from "./ollama.js";
import { createOpenAIClient } from "./openai.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models.js";
import { LLMClientError } from "../errors/llm_client.js";
import { Logger } from "winston";

export class LLMManager {
  private clients: Map<string, BaseChatModel> = new Map();
  private defaultClientAlias: string = '';

  constructor(
    private readonly logger: Logger
  ) {}

  registerClient(alias: string, client: LlmConfig, defaultClient: boolean = false) {
    switch (client.provider) {
      case 'openai':
        this.logger.debug(`Initializing OpenAI API client for alias: ${client.alias} [${client.location}]`);

        this.clients.set(client.alias, createOpenAIClient(client));
        break;
      case 'ollama':
        this.logger.debug(`Initializing Ollama API client for alias: ${client.alias} [${client.location}]`);
        
        this.clients.set(client.alias, createOllamaClient(client));
        break;
      default:
        this.logger.warn(`Unsupported LLM provider: ${client.provider}`);
        break;
    }

    if (defaultClient || !this.defaultClientAlias) {
      this.defaultClientAlias = alias;
    }
  }

  getClient(alias?: string): BaseChatModel {
    if (this.clients.size === 0) {
      throw new LLMClientError('No LLM clients registered');
    }
    
    if (alias) {
      const client = this.clients.get(alias);
      
      if (!client) {
        throw new LLMClientError(`LLM client with alias '${alias}' not found`);
      }

      return client;
    } else {
      return this.getClient(this.defaultClientAlias);
    }
  }
}

export default function initializeLLMs(app: Application) {
  const llmConfig = app.config.loadConfig('llm', LlmConfigSchema);

  app.llm = new LLMManager(
    app.logger.child({ location: 'LLMManager' })
  );

  for (const apiConfig of llmConfig.apis) {
    app.llm.registerClient(apiConfig.alias, apiConfig);
  }
}
