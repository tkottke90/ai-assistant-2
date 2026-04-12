import { LlmSelector } from "@/components/llm-selector";
import { Button } from "@/components/ui/button";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { REFRESH_THREADS_EVT, STREAM_CHAT_EVT } from "@/lib/chat";
import { fireWorkerEvent, useWorkerEventListener } from "@/lib/workerClient";
import type { Signal } from "@preact/signals";
import type { ActiveAgent, ThreadResponse } from "@tkottke90/ai-assistant-client";
import { SendHorizonal, SquareStopIcon } from "lucide-preact";
import { toast } from "sonner";
import { AgentChips } from "./agent-chips";
import { useChatContext } from "./chat-context";
import {
  buildAssistantMessage,
  buildUserMessage,
} from "./chat-utils";

export function createSubmitHandler(
  thread: Signal<ThreadResponse>,
  isStreaming: Signal<boolean>,
  selectedAlias: Signal<string>,
  selectedModel: Signal<string>,
  selectedAgentId: Signal<number | null>,
  activeAgents: Signal<ActiveAgent[]>,
  activeAssistantId: Signal<string | null>,
) {
  return function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const message = formData.get('message') as string;
    const threadId = thread.value.threadId;

    if (!message.trim()) return;

    form.reset();

    const agentName = activeAgents.value.find(a => a.agent_id === selectedAgentId.value)?.name;
    const userMessage = buildUserMessage(message);
    const assistantMessage = buildAssistantMessage(agentName);

    activeAssistantId.value = assistantMessage.id;

    thread.value = {
      ...thread.value,
      history: [...(thread.value.history ?? []), userMessage],
    };
    isStreaming.value = true;

    fireWorkerEvent({
      type: STREAM_CHAT_EVT,
      message,
      threadId,
      alias: selectedAlias.value || undefined,
      model: selectedModel.value || undefined,
      agentId: selectedAgentId.value ?? undefined,
      agentName,
      assistantId: assistantMessage.id,
    });
  };
}

export function ChatForm() {
  const { thread, agentSelection, isStreaming, activeAssistantId } = useChatContext();
  const llmSelection = useLlmSelection();
  const { selectedAlias, selectedModel } = llmSelection;

  // ── Stream event handlers ────────────────────────────────────────────────

  useWorkerEventListener('chat:stream:start', (e) => {
    isStreaming.value = true;
  });

  useWorkerEventListener('chat:stream:done', () => {
    activeAssistantId.value = null;
    isStreaming.value = false;

    fireWorkerEvent({ type: REFRESH_THREADS_EVT });
  });
  
  useWorkerEventListener('chat:stream:error', (e) => {
    console.error('Chat stream error:', e.detail.error);
    toast.error('Failed to get a response. Please try again.');
    
    activeAssistantId.value = null;
    isStreaming.value = false;
  });

  return (
    <form className="w-full flex flex-col gap-1" onSubmit={createSubmitHandler(
        thread,
        isStreaming,
        selectedAlias,
        selectedModel,
        agentSelection.selectedAgentId,
        agentSelection.activeAgents,
        activeAssistantId,
      )}
    >
      <input type="text" hidden id="threadId" name="threadId" value={thread.value.threadId} />

      <div className="w-full flex flex-row gap-2">
        <div className="w-full border border-neutral-500/50 rounded-md">
          <div id="file-container" className="flex gap-2"></div>

          <textarea
            className="w-full h-24 p-2 rounded-md focus:ring-0 focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Type your message here..."
            name="message"
          />
        </div>

        <Button variant="default" type="submit" disabled={isStreaming.value}>
          
          { isStreaming.value && <span class="ml-1 text-sm animate-pulse">
            <SquareStopIcon size={20} class="inline" />
          </span> }
          
          { !isStreaming.value && <span class="hidden lg:inline">Send</span> }
          { !isStreaming.value && <SendHorizonal size={20} class="inline lg:hidden" /> }
        </Button>
      </div>

      <div className="w-full flex gap-8">
        <LlmSelector llmSelection={llmSelection} disabled={isStreaming.value} />
        <AgentChips agentSelection={agentSelection} disabled={isStreaming.value} />
      </div>
    </form>
  );
}

