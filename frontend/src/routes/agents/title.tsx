import type { AgentListResponse } from "@tkottke90/ai-assistant-client";

export function AgentTitle({ agent }: { agent: AgentListResponse }) {
  return (
    <div className="">
      <span>{agent.name}</span>
      <span className="ml-2 px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-800/50 dark:text-gray-300/50">Version: {agent.version}</span>
    </div>
  )
}