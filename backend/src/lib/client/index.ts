import { createClientMethod} from './client';
import { z } from 'zod';

const ServerInfoOutputSchema = z.object({
  version: z.string(),
  name: z.number(),
});

export const getServerInfo = createClientMethod('/api', { method: 'get' }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch server info: ${response.statusText}`);
  }
  
  return ServerInfoOutputSchema.parse(response.json());
});

// Export utilities for building custom clients
export { HttpError } from './error';
export * from './lib/agents';
export * from './lib/chat';
