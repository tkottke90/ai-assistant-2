import { z } from 'zod';
import { ServerConfigSchema } from './server.schema';
import { LoggingSchema } from './logging.schema';
import { LlmConfigSchema } from './llm.schema';

export const ConfigSchema = z.object({
  server: ServerConfigSchema,
  logging: LoggingSchema,
  llm: LlmConfigSchema
});