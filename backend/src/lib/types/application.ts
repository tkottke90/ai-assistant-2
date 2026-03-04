import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type AgentManager } from '../agents/agent-manager';
import { type ToolManager } from '../tools/manager';
import { type DbHealthMonitor } from '../health';
import express from 'express';
import type { Logger } from 'winston';
import z from 'zod';
import { LLMManager } from '../llm';

// Augment the Express namespace
declare global {
  namespace Express {
    interface Application {
      agents: AgentManager;
      tools: ToolManager;
      dbHealth: DbHealthMonitor;

      config: {
        _configData: Record<string, any>;

        /**
         * Gets a config value by key, first checking environment variables, then the config file, and finally falling back to a default value if provided.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found in either environment variables or the config file
         * @returns The config value as a string, or the default value if the key is not found
         */
        get(key: string, defaultValue?: string): string;

        /**
         * Utility method to get a config value as a boolean.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found or cannot be parsed as a boolean
         * @returns The config value parsed as a boolean, or the default value if the key is not found or cannot be parsed
         */
        getBoolean(key: string, defaultValue?: boolean): boolean;

        /**
         * Utility method to get a config value as a number.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found or cannot be parsed as a number
         * @returns The config value parsed as a number, or the default value if the key is not found or cannot be parsed
         */
        getNumber(key: string, defaultValue?: number): number;

        /**
         * Checks for the existence of a config key in either environment variables or the config file
         * @param key The config key to check for
         * @returns True if the key exists in either environment variables or the config file, false otherwise
         */
        has(key: string): boolean;

        /**
         * Loads a config section and validates it against a provided Zod schema. If the config value is missing or fails validation, an error is thrown.
         * @param key The config key to load
         * @param schema A Zod schema to validate the config value against
         * @returns The parsed config value if validation is successful
         * @throws An error if the config key is not found or if validation fails
         */
        loadConfig<T>(key: string, schema: T): T extends z.ZodTypeAny ? z.infer<T> : any;
      };
      logger: Logger;
      llm: LLMManager;
    }

    interface Request {
      // You can add custom properties to the Request object here if needed
      logger: Logger;
    }
  }
}

// Re-export for convenience
export type Request = express.Request;
export type Response = express.Response;
export type Application = express.Application;