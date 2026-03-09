import { Button } from "@/components/ui/button";
import { LlmSelector } from "@/components/llm-selector";
import type { Signal } from "@preact/signals";
import { useSignal } from "@preact/signals";
import { SendHorizonal } from "lucide-preact";
import { toast } from "sonner";
import type { ActiveAgent, ChatMessage, ServerAction, ThreadResponse } from "@tkottke90/ai-assistant-client";
import {
  buildUserMessage,
  buildAssistantMessage,
  appendToMessage,
  patchMessage,
} from "./chat-utils";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { AgentChips } from "./agent-chips";
import { useChatContext } from "./chat-context";
import { fireWorkerEvent, useWorkerEventListener } from "@/lib/workerClient";
import { REFRESH_THREADS_EVT, STREAM_CHAT_EVT } from "@/lib/chat";

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
      history: [...(thread.value.history ?? []), userMessage, assistantMessage],
    };
    isStreaming.value = true;

    fireWorkerEvent({
      type: STREAM_CHAT_EVT,
      message,
      threadId,
      alias: selectedAlias.value || undefined,
      model: selectedModel.value || undefined,
      agentId: selectedAgentId.value ?? undefined,
    });
  };
}

export function ChatForm() {
  const { thread, agentSelection, isStreaming } = useChatContext();
  const llmSelection = useLlmSelection();
  const { selectedAlias, selectedModel } = llmSelection;

  // Tracks the id of the currently-streaming assistant InteractionMessage
  const activeAssistantId = useSignal<string | null>(null);

  // ── Stream event handlers ────────────────────────────────────────────────

  useWorkerEventListener('chat:stream:text_delta', (e) => {
    const id = activeAssistantId.value;
    if (!id) return;
    thread.value = {
      ...thread.value,
      history: appendToMessage(thread.value.history as ChatMessage[], id, e.detail.content),
    };
  });

  useWorkerEventListener('chat:stream:thinking', (e) => {
    const id = activeAssistantId.value;
    if (!id) return;
    thread.value = {
      ...thread.value,
      history: (thread.value.history as ChatMessage[]).map(msg => {
        if (msg.id !== id || msg.type !== 'chat_message') return msg;
        const existing = (msg.metadata?.thinking as string) ?? '';
        return { ...msg, metadata: { ...msg.metadata, thinking: existing + e.detail.content } };
      }),
    };
  });

  useWorkerEventListener('chat:stream:agent_name', (e) => {
    const id = activeAssistantId.value;
    if (!id) return;
    thread.value = {
      ...thread.value,
      history: patchMessage(thread.value.history as ChatMessage[], id, { name: e.detail.name }),
    };
  });

  useWorkerEventListener('chat:stream:tool_call_start', (e) => {
    const stub: ServerAction = {
      id: e.detail.id,
      type: 'server_action',
      role: 'tool',
      content: '',
      created_at: new Date().toISOString(),
      metadata: { tool_name: e.detail.name },
      severity: 0,
    };
    thread.value = {
      ...thread.value,
      history: [...(thread.value.history as ChatMessage[]), stub],
    };
  });

  useWorkerEventListener('chat:stream:tool_call_complete', (e) => {
    thread.value = {
      ...thread.value,
      history: (thread.value.history as ChatMessage[]).map(msg =>
        msg.id === e.detail.id && msg.type === 'server_action'
          ? { ...msg, metadata: { ...msg.metadata, tool_args: e.detail.args } }
          : msg
      ),
    };
  });

  useWorkerEventListener('chat:stream:tool_result', (e) => {
    thread.value = {
      ...thread.value,
      history: (thread.value.history as ChatMessage[]).map(msg =>
        msg.id === e.detail.toolCallId && msg.type === 'server_action'
          ? { ...msg, content: e.detail.content, metadata: { ...msg.metadata, tool_summary: e.detail.summary } }
          : msg
      ),
    };
  });

  useWorkerEventListener('chat:stream:done', () => {
    activeAssistantId.value = null;
    isStreaming.value = false;
    fireWorkerEvent({ type: REFRESH_THREADS_EVT });
  });

  useWorkerEventListener('chat:stream:error', (e) => {
    console.error('Chat stream error:', e.detail.error);
    toast.error('Failed to get a response. Please try again.');
    const id = activeAssistantId.value;
    if (id) {
      thread.value = {
        ...thread.value,
        history: (thread.value.history ?? []).filter((msg: ChatMessage) => msg.id !== id),
      };
    }
    activeAssistantId.value = null;
    isStreaming.value = false;
  });

  // ── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = createSubmitHandler(
    thread,
    isStreaming,
    selectedAlias,
    selectedModel,
    agentSelection.selectedAgentId,
    agentSelection.activeAgents,
    activeAssistantId,
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

