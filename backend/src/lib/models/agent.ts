import {z} from 'zod';
import { PaginationSchema } from '../types/pagination';

export const AgentProperties = z.object({
  name: z.string(),
  description: z.string().optional(),
  auto_start: z.boolean().default(false),
  system_prompt: z.string(),
  engine: z.string().optional(),
  model: z.string().optional()
});

export const AgentSchema = AgentProperties.extend({
  agent_id: z.number(),
  
  version: z.number().min(1).default(1),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type CreateAgentDTO = Omit<z.infer<typeof AgentProperties>, 'version'>;
export type UpdateAgentDTO = Partial<CreateAgentDTO> & { version: number };
export type Agent = z.infer<typeof AgentSchema>;

export const AgentListResponseSchema =  AgentSchema.extend({
  is_active: z.boolean()
})