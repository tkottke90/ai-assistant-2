import { Application } from "express";
import { LlmConfig, LlmConfigSchema } from '../config/llm.schema.js';
import { createOllamaClient } from "./ollama.js";
import { createOpenAIClient } from "./openai.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMClientError, LLMManagerCantGetModels } from "../errors/llm_client.js";
import { Logger } from "winston";
import { Ollama } from 'ollama';
import OpenAI from 'openai';

export class LLMManager {
  private clients: Map<string, BaseChatModel> = new Map();
  private configs: Map<string, LlmConfig> = new Map();
  private defaultClientAlias: string = '';

  constructor(
    private readonly logger: Logger
  ) {}

  registerClient(alias: string, client: LlmConfig, defaultClient: boolean = false) {
    switch (client.provider) {
      case 'openai':
        this.logger.debug(`Initializing OpenAI API client for alias: ${client.alias} [${client.location}]`);

        this.clients.set(client.alias, createOpenAIClient(client));
        this.configs.set(client.alias, client);
        break;
      case 'ollama':
        this.logger.debug(`Initializing Ollama API client for alias: ${client.alias} [${client.location}]`);

        this.clients.set(client.alias, createOllamaClient(client));
        this.configs.set(client.alias, client);
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

  getClientWithModel(alias: string, model: string): BaseChatModel {
    const config = this.configs.get(alias);

    if (!config) {
      throw new LLMClientError(`LLM config for alias '${alias}' not found`);
    }

    const overrideConfig: LlmConfig = { ...config, defaultModel: model };

    switch (config.provider) {
      case 'openai':
        return createOpenAIClient(overrideConfig);
      case 'ollama':
        return createOllamaClient(overrideConfig);
      default:
        throw new LLMClientError(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  getConfigs(): LlmConfig[] {
    return Array.from(this.configs.values());
  }

  async listModels(config: LlmConfig) {
    switch (config.provider) {
      case 'openai':{
        try {
          let headers: Headers | undefined = undefined;

          if (config.apiKey) {
            headers = new Headers();
            headers.set('Authorization', `Bearer ${config.apiKey}`);
          }

          const client = new OpenAI({
            baseURL: config.location,
            apiKey: config.apiKey,
          })

          const response = await client.models.list()

          return response.data.map(m => m.id);
        } catch (error) {
          this.logger.error(`Failed to list models for Ollama alias '${config.alias}': ${error instanceof Error ? error.message : error}`);
          throw new LLMManagerCantGetModels('Failed to fetch models from Ollama');
        }
      }
      case 'ollama':{
        try {
          let headers: Headers | undefined = undefined;

          if (config.apiKey) {
            headers = new Headers();
            headers.set('Authorization', `Bearer ${config.apiKey}`);
          }

          const client = new Ollama({
            host: config.location,
            headers
          })

          const response = await client.list()

          return response.models.map(m => m.name);
        } catch (error) {
          this.logger.error(`Failed to list models for Ollama alias '${config.alias}': ${error instanceof Error ? error.message : error}`);
          throw new LLMManagerCantGetModels('Failed to fetch models from Ollama');
        }
      }
      default:
        throw new LLMManagerCantGetModels(`Unsupported LLM provider: ${config.provider}`);
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
