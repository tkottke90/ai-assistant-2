import { Button } from "@/components/ui/button";
import { LlmSelector } from "@/components/llm-selector";
import type { Signal } from "@preact/signals";
import { SendHorizonal } from "lucide-preact";
import { toast } from "sonner";
import type { ChatMessage, ThreadResponse } from "@tkottke90/ai-assistant-client";
import {
  buildUserMessage,
  buildAssistantMessage,
  parseMessagesChunk,
  isDoneEvent,
  appendToMessage,
} from "./chat-utils";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { AgentChips } from "./agent-chips";
import { useChatContext } from "./chat-context";
import { fireWorkerEvent } from "@/lib/workerClient";
import { REFRESH_THREADS_EVT } from "@/lib/chat";

export function createSubmitHandler(
  thread: Signal<ThreadResponse>,
  isStreaming: Signal<boolean>,
  selectedAlias: Signal<string>,
  selectedModel: Signal<string>,
  selectedAgentId: Signal<number | null>,
) {
  return async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const message = formData.get('message') as string;
    const threadId = thread.value.threadId;

    if (!message.trim()) return;

    form.reset();

    const userMessage = buildUserMessage(message);
    const assistantMessage = buildAssistantMessage();
    const assistantId = assistantMessage.id;

    thread.value = {
      ...thread.value,
      history: [...(thread.value.history ?? []), userMessage, assistantMessage],
    };
    isStreaming.value = true;

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          threadId,
          alias: selectedAlias.value || undefined,
          model: selectedModel.value || undefined,
          agentId: selectedAgentId.value ?? undefined,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value);
        const lines = raw.split('\n\n');

        for (const line of lines) {
          if (isDoneEvent(line)) break;

          const content = parseMessagesChunk(line);
          if (content) {
            thread.value = {
              ...thread.value,
              history: appendToMessage(thread.value.history as ChatMessage[], assistantId, content),
            };
          }
        }
      }
    } catch (err) {
      console.error('Chat stream error:', err);
      toast.error('Failed to get a response. Please try again.');
      thread.value = {
        ...thread.value,
        history: (thread.value.history ?? []).filter((msg: ChatMessage) => msg.id !== assistantId),
      };
    } finally {
      isStreaming.value = false;
      fireWorkerEvent({ type: REFRESH_THREADS_EVT });
    }
  };
}

export function ChatForm() {
  const { thread, agentSelection, isStreaming } = useChatContext();
  const llmSelection = useLlmSelection();

  const { selectedAlias, selectedModel } = llmSelection;
  const handleSubmit = createSubmitHandler(
    thread,
    isStreaming,
    selectedAlias,
    selectedModel,
    agentSelection.selectedAgentId,
  );

  return (
    <form className="w-full flex flex-col gap-1" onSubmit={handleSubmit}>
      <input type="text" hidden id="threadId" name="threadId" value={thread.value.threadId} />

      <div className="w-full flex flex-row gap-2">
        <div className="w-full border border-neutral-500/50 rounded-md">
          <div id="file-container" className="flex gap-2"></div>

          <textarea
            className="w-full h-24 p-2 rounded-md focus:ring-0 focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Type your message here..."
            name="message"
            disabled={isStreaming.value}
          />
        </div>

        <Button variant="default" type="submit" disabled={isStreaming.value}>
          <span class="hidden lg:inline">Send</span>
          <SendHorizonal size={20} class="inline lg:hidden" />
        </Button>
      </div>

      <div className="w-full flex gap-8">
        <LlmSelector llmSelection={llmSelection} disabled={isStreaming.value} />
        <AgentChips agentSelection={agentSelection} disabled={isStreaming.value} />
      </div>
    </form>
  );
}

