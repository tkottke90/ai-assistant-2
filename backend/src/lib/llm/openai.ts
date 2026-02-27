import { ChatOpenAI } from '@langchain/openai';
import { LlmConfig} from '../config/llm.schema';

export function createOpenAIClient(config: LlmConfig) {
  return new ChatOpenAI({
    openAIApiKey: config.apiKey,
    modelName: config.defaultModel,
    configuration: {
      baseURL: config.location,
    }
  });
}