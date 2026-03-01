import { useSignal, type Signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { ActiveAgent } from "@tkottke90/ai-assistant-client";

// --- Pure functions (extracted for testability) ---

export async function fetchActiveAgents(): Promise<ActiveAgent[]> {
  const res = await fetch('/api/v1/agents/active');
  if (!res.ok) throw new Error(`Failed to load active agents: ${res.status}`);
  const data = await res.json() as { agents: ActiveAgent[] };
  return data.agents;
}

export function toggleAgentSelection(
  currentId: number | null,
  clickedId: number,
): number | null {
  return currentId === clickedId ? null : clickedId;
}

// --- Hook ---

export interface AgentSelection {
  activeAgents: Signal<ActiveAgent[]>;
  selectedAgentId: Signal<number | null>;
  loading: Signal<boolean>;
  selectAgent: (agentId: number) => void;
  clearSelection: () => void;
}

export function useAgentSelection(): AgentSelection {
  const activeAgents = useSignal<ActiveAgent[]>([]);
  const selectedAgentId = useSignal<number | null>(null);
  const loading = useSignal(false);

  useEffect(() => {
    loading.value = true;
    fetchActiveAgents()
      .then((agents) => {
        activeAgents.value = agents;
      })
      .catch((err) => {
        console.error('Failed to load active agents:', err);
      })
      .finally(() => {
        loading.value = false;
      });
  }, []);

  const selectAgent = (agentId: number) => {
    selectedAgentId.value = toggleAgentSelection(selectedAgentId.value, agentId);
  };

  const clearSelection = () => {
    selectedAgentId.value = null;
  };

  return { activeAgents, selectedAgentId, loading, selectAgent, clearSelection };
}
