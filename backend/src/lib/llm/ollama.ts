import { ChatOllama } from '@langchain/ollama';
import { LlmConfig} from '../config/llm.schema';
import { wrapSDK } from "langsmith/wrappers"; // traces openai calls

export function createOllamaClient(config: LlmConfig): ChatOllama {
  return wrapSDK(new ChatOllama({
    model: config.defaultModel,
    baseUrl: config.location
  }));
}