/**
 * Shared test helpers for @llm tests.
 *
 * Usage:
 *   CONFIG_DIR=../config TEST_LLM_ALIAS=local-ollama npm test -- --grep @llm
 *
 * If TEST_LLM_ALIAS is not set, falls back to the first API entry in config.yaml.
 * No Express app or database is required.
 */

import { readFileSync } from "fs";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { LlmConfigSchema } from "../../../config/llm.schema.js";
import { createOllamaClient } from "../../../llm/ollama.js";
import { createOpenAIClient } from "../../../llm/openai.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import winston from "winston";

export function createTestLLM(): BaseChatModel {
  const configDir = process.env.CONFIG_DIR
    ? path.resolve(process.env.CONFIG_DIR)
    : path.join(os.homedir(), "config/ai-assistant");

  const configFilePath = path.join(configDir, "config.yaml");
  const raw = yaml.parse(readFileSync(configFilePath, "utf-8"));
  const llmConfig = LlmConfigSchema.parse(raw.llm ?? {});

  const alias = process.env.TEST_LLM_ALIAS;
  const entry = alias
    ? llmConfig.apis.find((a) => a.alias === alias)
    : llmConfig.apis[0];

  if (!entry) {
    throw new Error(
      `No LLM entry found for alias '${alias ?? "(default)"}'. ` +
        `Check CONFIG_DIR and TEST_LLM_ALIAS.`,
    );
  }

  switch (entry.provider) {
    case "ollama":
      return createOllamaClient(entry);
    case "openai":
    case "custom":
      return createOpenAIClient(entry);
    default:
      throw new Error(`Unsupported provider: ${entry.provider}`);
  }
}

export function createTestLogger(): winston.Logger {
  return winston.createLogger({
    level: "warn",
    transports: [new winston.transports.Console()],
    silent: !process.env.TEST_LOG,
  });
}
