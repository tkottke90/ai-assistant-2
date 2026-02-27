import { ChatOllama } from '@langchain/ollama';
import { LlmConfig} from '../config/llm.schema';

export function createOllamaClient(config: LlmConfig): ChatOllama {
  return new ChatOllama({
    model: config.defaultModel,
    baseUrl: config.location
  });
}