import {
  listPendingActions,
  listAgents,
  listActiveAgents,
  type AgentAction,
  type AgentListResponse,
  type ActiveAgent,
} from '@tkottke90/ai-assistant-client';
import type { inferResponseEvents } from './worker-event.types';
import { cacheGet, cachePut } from './cache';


// --- Refresh Active Agents (SWR) ---

export const REFRESH_AGENTS_EVT = 'refresh:agents' as const;
type REFRESH_AGENTS_EVT_TYPE = typeof REFRESH_AGENTS_EVT;

export interface RefreshAgentsMessage {
  type: REFRESH_AGENTS_EVT_TYPE;
}

export type RefreshAgentsResponse = inferResponseEvents<REFRESH_AGENTS_EVT_TYPE, ActiveAgent[]>;

export async function refreshActiveAgents(
  emit: (msg: RefreshAgentsResponse) => void,
): Promise<void> {
  try {
    const cached = await cacheGet<ActiveAgent[]>('agents', 'active');
    if (cached) {
      emit({ type: 'refresh:agents:response', data: cached });
    }
  } catch { /* cache miss is fine */ }

  try {
    const { agents } = await listActiveAgents({});
    await cachePut('agents', 'active', agents);
    emit({ type: 'refresh:agents:response', data: agents });
  } catch (error) {
    emit({
      type: 'refresh:agents:error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}




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
