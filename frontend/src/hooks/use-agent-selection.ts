import { useSignal, type Signal } from "@preact/signals";
import type { ActiveAgent } from "@tkottke90/ai-assistant-client";
import { REFRESH_AGENTS_EVT } from "@/lib/agents";
import { useWorkerEvent } from "@/lib/workerClient";

// --- Pure functions (extracted for testability) ---

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
  refresh: () => void;
}

export function useAgentSelection(): AgentSelection {
  const activeAgents = useSignal<ActiveAgent[]>([]);
  const selectedAgentId = useSignal<number | null>(null);
  const loading = useSignal(false);

  const sendRefresh = useWorkerEvent(
    REFRESH_AGENTS_EVT,
    (e) => {
      activeAgents.value = e.detail.data;
      loading.value = false;
    },
    {
      disableDebounce: true,
      errorCallback: () => {
        loading.value = false;
      },
    },
  );

  // Initial fetch on mount happens via useWorkerEvent (sendRefresh is returned)
  // We fire it eagerly:
  const refresh = () => {
    loading.value = true;
    sendRefresh({});
  };

  // Trigger initial load
  refresh();

  const selectAgent = (agentId: number) => {
    selectedAgentId.value = toggleAgentSelection(selectedAgentId.value, agentId);
  };

  const clearSelection = () => {
    selectedAgentId.value = null;
  };

  return { activeAgents, selectedAgentId, loading, selectAgent, clearSelection, refresh };
}
