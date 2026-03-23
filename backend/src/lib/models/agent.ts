import {z} from 'zod';
import { PaginationSchema } from '../types/pagination';
import { MemorySchema } from './memory';

export const AgentProperties = z.object({
  name: z.string(),
  description: z.string().optional(),
  auto_start: z.boolean().default(false),
  system_prompt: z.string(),
  engine: z.string().optional(),
  model: z.string().optional(),
  version: z.number().min(1).default(1),
});

export const AgentSchema = AgentProperties.extend({
  agent_id: z.number(),
  
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const CreateAgentSchema = AgentProperties;

export type CreateAgentDTO = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentDTO = Partial<CreateAgentDTO> & { version: number };
export type Agent = z.infer<typeof AgentSchema>;

export const AgentListResponseSchema =  AgentSchema.extend({
  is_active: z.boolean()
})

export const AgentDetailsSchema = AgentListResponseSchema.extend({
  memories: z.object({
    pagination: PaginationSchema,
    data: z.array(MemorySchema),
  }),
  tools: z.record(z.string(), z.object({
    allowEdit: z.boolean(),
    value: z.boolean()
  })),
});

export type AgentDetails = z.infer<typeof AgentDetailsSchema>;

export const ActiveAgentSchema = z.object({
  agent_id: z.number(),
  name: z.string(),
  description: z.string().optional(),
});

export type ActiveAgent = z.infer<typeof ActiveAgentSchema>;