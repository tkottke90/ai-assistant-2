import { z } from 'zod';

export const LlmCostSchema = z.object({
  inputToken: z.number().default(0),
  outputToken: z.number().default(0),
  scale: z.number().default(1000)
}).default({
  inputToken: 0,
  outputToken: 0,
  scale: 0
});

export const LlmApiSchema = z.object({
  alias: z.string().default('local-ollama'),
  provider: z.enum(['ollama', 'openai', 'custom']).default('ollama'),
  defaultModel: z.string().default('qwen3:8b'),
  location: z.string().default('http://localhost:11434'),
  apiKey: z.string().default('').optional(),
  cost: LlmCostSchema
});

export const LlmConfigSchema = z.object({
  apis: z.array(LlmApiSchema).default([])
}).default({
  apis: [
    {
      alias: 'local-ollama',
      provider: 'ollama',
      defaultModel: 'qwen3:8b',
      location: 'http://localhost:11434',
      apiKey: '',
      cost: {
        inputToken: 0,
        outputToken: 0,
        scale: 0
      }
    }
  ]
});


export type LlmCostConfig = z.infer<typeof LlmCostSchema>;
export type LlmConfig = z.infer<typeof LlmApiSchema>;
export type LlmConfigSchema = z.infer<typeof LlmConfigSchema>;