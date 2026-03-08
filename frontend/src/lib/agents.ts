import {
  listPendingActions,
  listAgents,
  type AgentAction,
  type AgentListResponse
} from '@tkottke90/ai-assistant-client';
import type { inferResponseEvents } from './worker-event.types';




// --- List Agents ---

export interface ListAgentsMessage {
  type: 'list:agents';
}

export type ListAgentsResponse = inferResponseEvents<'list:agents', AgentListResponse[]>;

export async function createListAgentsMessage() {
  try {
    const data = await listAgents({});
    return { type: 'list:agents:response', data };
  } catch (error) {
    return {
      type: 'list:agents:error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- List Agent Actions ---
export interface ListAgentActionsMessage {
  type: 'list:agent-actions';
  agentId: number;
};

export type ListAgentActionsResponse = inferResponseEvents<'list:agent-actions', AgentAction[]>;

export async function createListAgentActionsMessage(agentId: number): Promise<ListAgentActionsResponse> {
  try {
    const data = await listPendingActions({ agentId });
    return { type: 'list:agent-actions:response', data };
  } catch (error) {
    return {
      type: 'list:agent-actions:error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
