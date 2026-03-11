import { useApi } from '@/hooks/use-api';
import {
  removeAgentTool,
  upsertAgentTool,
  viewAgentTools,
  type AgentToolView,
} from '@tkottke90/ai-assistant-client';
import { useCallback, useEffect } from 'preact/hooks';
import { toast } from 'sonner';

export function useAgentTools(agentId: number) {
  const { value: tools, loading, execute: refresh } = useApi(
    useCallback(() => viewAgentTools({ agentId }), [agentId])
  );

  useEffect(() => { refresh(); }, [agentId, refresh]);

  const onAdd = useCallback((tool: AgentToolView) => {
    upsertAgentTool({ agentId, tool_id: tool.tool_id, tier: tool.tier })
      .then(() => refresh())
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to add tool'));
  }, [agentId, refresh]);

  const onRemove = useCallback((tool: AgentToolView) => {
    removeAgentTool({ agentId, toolId: tool.tool_id })
      .then(() => refresh())
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to remove tool'));
  }, [agentId, refresh]);

  const onTierChange = useCallback((tool: AgentToolView, tier: 1 | 2 | 3) => {
    upsertAgentTool({ agentId, tool_id: tool.tool_id, tier })
      .then(() => refresh())
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to update tier'));
  }, [agentId, refresh]);

  return { tools, loading, onAdd, onRemove, onTierChange };
}
