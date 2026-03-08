import type { AgentSelection } from "@/hooks/use-agent-selection";
import { createContextWithHook } from "@/lib/utils";
import type { Signal } from "@preact/signals";
import type { ThreadResponse } from "@tkottke90/ai-assistant-client";

export const {
  Provider: ChatContextProvider,
  useHook: useChatContext,
} = createContextWithHook<{
  thread: Signal<ThreadResponse>;
  agentSelection: AgentSelection;
  isStreaming: Signal<boolean>;
}>();