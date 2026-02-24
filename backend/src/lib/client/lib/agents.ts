import { createClientMethod} from '../client';
import { AgentSchema, AgentProperties } from '../../models/agent.js';
import { withPagination } from '../../types/pagination.js';
import { z } from 'zod';

export const createAgent = createClientMethod('/api/v1/agents', { method: 'post', inputSchema: AgentProperties }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to create agent: ${response.statusText}`);
  }
  
  return AgentSchema.parse(await response.json());
});

export const listAgents = createClientMethod('/api/v1/agents', { method: 'get' }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to list agents: ${response.statusText}`);
  }
  
  const PaginatedAgentsSchema = withPagination(AgentSchema);
  return PaginatedAgentsSchema.parse(await response.json());
});

export const getAgent = createClientMethod('/api/v1/agents/:id', { method: 'get' }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch agent: ${response.statusText}`);
  }
  
  return AgentSchema.parse(await response.json());
});

export const updateAgent = createClientMethod('/api/v1/agents/:id', { method: 'put', inputSchema: AgentProperties.partial() }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to update agent: ${response.statusText}`);
  }
  
  return AgentSchema.parse(await response.json());
});

export const deleteAgent = createClientMethod('/api/v1/agents/:id', { method: 'delete', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to delete agent: ${response.statusText}`);
  }
  
  return response; // No content expected, return raw response
});

// Export types for external use
export type CreateAgentInput = z.infer<typeof AgentProperties>;
export type Agent = z.infer<typeof AgentSchema>;