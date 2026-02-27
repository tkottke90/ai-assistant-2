import { z } from 'zod';

const CorsConfigSchema = z.object({
  allow_origins: z.array(z.string()).default([]),
  allow_headers: z.array(z.string()).default([]),
}).default({
  allow_origins: [],
  allow_headers: [],
});

export const ServerConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  cors: CorsConfigSchema,
}).default({
  port: 3000,
  host: 'localhost',
  cors: {
    allow_origins: [],
    allow_headers: [],
  },
});