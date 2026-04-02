import { ChatOpenAI } from '@langchain/openai';
import { LlmConfig} from '../config/llm.schema';

export function createOpenAIClient(config: LlmConfig) {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    modelName: config.defaultModel,
    configuration: {
      baseURL: config.location,
    }
  });
}