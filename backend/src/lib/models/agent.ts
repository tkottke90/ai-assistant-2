import {z} from 'zod';

const AgentProperties = z.object({
  name: z.string(),
  description: z.string().optional(),
  system_prompt: z.string()
});

const AgentSchema = AgentProperties.extend({
  agent_id: z.number(),
  
  version: z.number().min(1).default(1),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type CreateAgentDTO = Omit<z.infer<typeof AgentProperties>, 'version'>;
export type UpdateAgentDTO = Partial<CreateAgentDTO> & { version: number };
export type Agent = z.infer<typeof AgentSchema>;