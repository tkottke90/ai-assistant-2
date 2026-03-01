import type { AgentSelection } from "@/hooks/use-agent-selection";
import type { ActiveAgent } from "@tkottke90/ai-assistant-client";

// --- Pure functions (extracted for testability) ---

export function chipClass(isSelected: boolean): string {
  const base =
    "px-3 py-1 rounded-full font-medium cursor-pointer transition-colors select-none whitespace-nowrap";
  return isSelected
    ? `${base} bg-green-600 text-primary-foreground`
    : `${base} bg-green-700/10 text-muted-foreground hover:bg-muted/80 dark:hover:bg-muted/40`;
}

export function selectedAgentName(
  agents: ActiveAgent[],
  selectedId: number | null,
): string | null {
  if (selectedId == null) return null;
  return agents.find((a) => a.agent_id === selectedId)?.name ?? null;
}

// --- Component ---

interface AgentChipsProps {
  agentSelection: AgentSelection;
  disabled?: boolean;
}

export function AgentChips({ agentSelection, disabled }: AgentChipsProps) {
  const { activeAgents, selectedAgentId, selectAgent } = agentSelection;

  if (activeAgents.value.length === 0) return null;

  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <span className="text-muted-foreground mr-0.5">Agent:</span>
      {activeAgents.value.map((agent) => (
        <button
          key={agent.agent_id}
          type="button"
          disabled={disabled}
          className={chipClass(selectedAgentId.value === agent.agent_id)}
          onClick={() => selectAgent(agent.agent_id)}
          title={agent.description || agent.name}
        >
          {agent.name}
        </button>
      ))}
    </div>
  );
}
