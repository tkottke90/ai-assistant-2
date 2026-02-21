import { z } from 'zod';
import { ServerConfigSchema } from './server.schema';
import { LoggingSchema } from './logging.schema';

export const ConfigSchema = z.object({
  server: ServerConfigSchema,
  logging: LoggingSchema
});