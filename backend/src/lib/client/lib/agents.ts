import { createClientMethod} from '../client';
import { AgentSchema, AgentProperties, AgentListResponseSchema, AgentDetailsSchema, ActiveAgentSchema } from '../../models/agent.js';
import { MemorySchema } from '../../models/memory.js';
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
  
  const PaginatedAgentsSchema = withPagination(AgentListResponseSchema);
  return PaginatedAgentsSchema.parse(await response.json());
});

export const getAgent = createClientMethod('/api/v1/agents/:id', { method: 'get' }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch agent: ${response.statusText}`);
  }
  
  return AgentSchema.parse(await response.json());
});

export const startAgent = createClientMethod('/api/v1/agents/:id/start', { method: 'post', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to start agent: ${response.statusText}`);
  }
  
  return response; // No content expected, return raw response
});

export const stopAgent = createClientMethod('/api/v1/agents/:id/stop', { method: 'post', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to stop agent: ${response.statusText}`);
  }
  
  return response; // No content expected, return raw response
});

export const updateAgent = createClientMethod('/api/v1/agents/:id', { method: 'put', inputSchema: AgentProperties.partial().extend({ id: z.number() }) }, async (response) => {
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

export const getAgentDetails = createClientMethod('/api/v1/agents/:id/details', { method: 'get', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch agent details: ${response.statusText}`);
  }

  return AgentDetailsSchema.parse(await response.json());
});

export const deleteAgentMemory = createClientMethod('/api/v1/agents/:id/memories/:nodeId', { method: 'delete', inputSchema: z.object({ id: z.number(), nodeId: z.number() }) }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to delete memory: ${response.statusText}`);
  }

  return response;
});

const ActiveAgentsResponseSchema = z.object({ agents: z.array(ActiveAgentSchema) });

export const listActiveAgents = createClientMethod('/api/v1/agents/active', { method: 'get' }, async (response) => {
  if (!response.ok) {
    throw new Error(`Failed to list active agents: ${response.statusText}`);
  }

  return ActiveAgentsResponseSchema.parse(await response.json());
});

// Export types for external use
export type CreateAgentInput = z.infer<typeof AgentProperties>;
export type Agent = z.infer<typeof AgentSchema>;
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;
export type AgentDetails = z.infer<typeof AgentDetailsSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type ActiveAgent = z.infer<typeof ActiveAgentSchema>;