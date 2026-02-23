import { z } from 'zod';

export const LlmApiSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'custom']).default('openai'),
  defaultModel: z.string().default('qwen3:8b'),
  location: z.string().default('http://localhost:11434'),
  apiKey: z.string().default('').optional(),
  cost: z.record(z.string(), z.number()).optional().default({
    prompt: 0,
    completion: 0,
    total: 0
  })
});

export const LlmConfigSchema = z.object({
  apis: z.array(LlmApiSchema).default([])
}).default({
  apis: [
    {
      provider: 'ollama',
      defaultModel: 'qwen3:8b',
      location: 'http://localhost:11434',
      apiKey: '',
      cost: {
        prompt: 0,
        completion: 0,
        total: 0
      }
    }
  ]
});