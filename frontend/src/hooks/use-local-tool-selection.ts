import { useApi } from '@/hooks/use-api';
import { listTools, type AgentToolView } from '@tkottke90/ai-assistant-client';
import { useSignal } from '@preact/signals';
import { useCallback, useEffect, useMemo } from 'preact/hooks';

interface SelectedTool {
  tool_id: number;
  tier: 1 | 2 | 3;
}

/** Merge the full registry with the local selection state to produce AgentToolView[]. */
export function applyLocalSelection(
  allTools: AgentToolView[],
  selected: SelectedTool[]
): AgentToolView[] {
  return allTools.map((t) => {
    const sel = selected.find((s) => s.tool_id === t.tool_id);
    return {
      ...t,
      assigned: sel !== undefined,
      tier: sel?.tier ?? 1,
    };
  });
}

/**
 * Provides a read-only view of the tool registry populated from the backend,
 * with local-only add/remove/tier-change mutations (no API writes).
 * Intended for contexts like evaluations where tool selection is stored locally.
 */
export function useLocalToolSelection() {
  const allTools = useApi(useCallback(() => listTools({}), []));
  const selectedTools = useSignal<SelectedTool[]>([]);

  useEffect(() => { allTools.execute(); }, []);

  const tools = useMemo(
    () => applyLocalSelection(allTools.value.value ?? [], selectedTools.value),
    [allTools.value.value, selectedTools.value]
  );

  const onAdd = useCallback((tool: AgentToolView) => {
    if (selectedTools.value.some((s) => s.tool_id === tool.tool_id)) return;
    selectedTools.value = [...selectedTools.value, { tool_id: tool.tool_id, tier: 1 }];
  }, []);

  const onRemove = useCallback((tool: AgentToolView) => {
    selectedTools.value = selectedTools.value.filter((s) => s.tool_id !== tool.tool_id);
  }, []);

  const onTierChange = useCallback((tool: AgentToolView, tier: 1 | 2 | 3) => {
    selectedTools.value = selectedTools.value.map((s) =>
      s.tool_id === tool.tool_id ? { ...s, tier } : s
    );
  }, []);

  return {
    tools: { value: tools } as { value: AgentToolView[] },
    loading: allTools.loading,
    selectedTools,
    onAdd,
    onRemove,
    onTierChange,
  };
}
