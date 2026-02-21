import { z } from 'zod';

export const LoggingSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  toConsole: z.boolean().default(true),
  toFile: z.boolean().default(true),
  excludePaths: z.array(z.string()).default([]),
}).default({
  level: 'info',
  toConsole: true,
  toFile: true,
  excludePaths: [],
});