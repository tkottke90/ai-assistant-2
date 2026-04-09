import { type RouterEventMap, useAppContext } from '@/app-context';
import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { useAgentSelection } from "@/hooks/use-agent-selection";
import type { StreamResume, WorkerStreamEvent } from "@/lib/chat";
import { GET_THREAD_EVT, REFRESH_THREADS_EVT, RESUME_STREAM_EVT } from "@/lib/chat";
import { useEventListener } from "@/lib/html-utils";
import { fireWorkerEvent, useWorkerEvent, useWorkerEventListener } from "@/lib/workerClient";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import {
  type AgentAction,
  type ChatMessage,
  resolveAgentAction,
  type ThreadResponse,
} from '@tkottke90/ai-assistant-client';
import { useLocation, useRoute } from "preact-iso";
import { useRef } from "preact/hooks";
import { toast } from "sonner";
import { ChatContextProvider, useChatContext } from "./chat-context";
import { ChatForm } from "./chat-form";
import chatHistory from "./chat-history";
import {
  appendToMessage,
  buildAssistantMessage,
  patchMessage,
} from "./chat-utils";
import { ChatMessageDisplay } from "./messages";
import { ThreadHeader } from "./thread-header";

// ── Pure utility functions ───────────────────────────────────────────────────

/** Returns a human-readable relative expiry string, e.g. "in 4 minutes". */
function formatExpiry(expiresAt: Date): string {
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return 'expired';
  const mins = Math.ceil(diffMs / 60_000);
  return mins === 1 ? 'in 1 minute' : `in ${mins} minutes`;
}

// ── Components ───────────────────────────────────────────────────────────────

function PendingActionCard({ action, onResolved }: {
  action: AgentAction;
  onResolved: () => void;
}) {
  const resolving = useSignal(false);

  const handleResolve = async (status: 'Approved' | 'Denied') => {
    resolving.value = true;
    try {
      await resolveAgentAction({ id: action.id, status });
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve action');
    } finally {
      resolving.value = false;
    }
  };

  return (
    <div className="border border-amber-400 dark:border-amber-600 rounded-lg p-4
      bg-amber-50 dark:bg-amber-950/40 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Permission Request
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            Expires {formatExpiry(action.expires_at)}
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Pending
        </span>
      </div>
      <p className="text-sm text-neutral-800 dark:text-neutral-200">{action.description}</p>
      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          variant="destructive"
          disabled={resolving.value}
          onClick={() => handleResolve('Denied')}
        >
          Deny
        </Button>
        <Button
          size="sm"
          variant="constructive"
          disabled={resolving.value}
          onClick={() => handleResolve('Approved')}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}

function PendingActionsPanel({ agentId, threadId }: {
  agentId: number;
  threadId: string;
}) {
  const actions = useSignal<AgentAction[]>([]);
  const { isStreaming } = useChatContext();

  const listAgentActions = useWorkerEvent(
    'list:agent-actions',
    (e) => {
      const all = e.detail.data as AgentAction[];
      actions.value = all.filter(a => a.thread_id === threadId);
    }
  );

  // Fetch on mount and re-fetch each time streaming completes (agent may have
  // emitted new approval requests during the run).
  useSignalEffect(() => {
    if (!isStreaming.value) {
      listAgentActions({ agentId });
    }
  });

  if (actions.value.length === 0) return null;

  return (
    <div className="space-y-2 px-1 pb-2">
      {actions.value.map(action => (
        <PendingActionCard
          key={action.id}
          action={action}
          onResolved={() => {
            actions.value = actions.value.filter(a => a.id !== action.id);
            fireWorkerEvent({ type: REFRESH_THREADS_EVT });
          }}
        />
      ))}
    </div>
  );
}

function ChatList() {
  const { thread } = useChatContext();

  const messages = useComputed(() => {
    return (thread.value.history ?? []) as ChatMessage[];
  });

  return (
    <div className="flex flex-col gap-2 pb-8">
      {messages.value.map(message => (
        <ChatMessageDisplay key={message.id} message={message} />
      ))}
    </div>
  );
}

// ── Chat Page ─────────────────────────────────────────────────────────────────

import type { Signal } from "@preact/signals";

function replayStreamEvent(
  thread: Signal<ThreadResponse>,
  activeAssistantId: Signal<string | null>,
  isStreaming: Signal<boolean>,
  event: WorkerStreamEvent,
  id: string,
): void {
  switch (event.type) {
    case 'chat:stream:text_delta':
      thread.value = {
        ...thread.value,
        history: appendToMessage(thread.value.history as ChatMessage[], id, event.content),
      };
      break;
    case 'chat:stream:thinking':
      thread.value = {
        ...thread.value,
        history: (thread.value.history as ChatMessage[]).map(msg => {
          if (msg.id !== id || msg.type !== 'chat_message') return msg;
          const existing = (msg.metadata?.thinking as string) ?? '';
          return { ...msg, metadata: { ...msg.metadata, thinking: existing + event.content } };
        }),
      };
      break;
    case 'chat:stream:agent_name':
      thread.value = {
        ...thread.value,
        history: patchMessage(thread.value.history as ChatMessage[], id, { name: event.name }),
      };
      break;
    case 'chat:stream:final_response':
      thread.value = {
        ...thread.value,
        history: patchMessage(thread.value.history as ChatMessage[], id, {
          usage: event.usage,
          model: event.model,
        }),
      };
      break;
    case 'chat:stream:tool_call_start': {
      const stub = {
        id: event.id,
        type: 'server_action' as const,
        role: 'tool' as const,
        content: `Calling tool - ${event.name}`,
        created_at: new Date().toISOString(),
        metadata: { tool_name: event.name },
        severity: 0,
      };
      const history = thread.value.history.slice(0, -1);
      const pendingMessage = thread.value.history?.at(-1);
      thread.value = {
        ...thread.value,
        history: [...(history as ChatMessage[]), stub, pendingMessage as ChatMessage],
      };
      break;
    }
    case 'chat:stream:tool_call_complete':
      thread.value = {
        ...thread.value,
        history: (thread.value.history as ChatMessage[]).map(msg =>
          msg.id === event.id && msg.type === 'server_action'
            ? { ...msg, metadata: { ...msg.metadata, tool_args: event.args } }
            : msg
        ),
      };
      break;
    case 'chat:stream:tool_result':
      thread.value = {
        ...thread.value,
        history: (thread.value.history as ChatMessage[]).map(msg =>
          msg.id === event.toolCallId && msg.type === 'server_action'
            ? { ...msg, content: event.content, metadata: { ...msg.metadata, tool_summary: event.summary } }
            : msg
        ),
      };
      break;
    case 'chat:stream:done':
      activeAssistantId.value = null;
      isStreaming.value = false;
      fireWorkerEvent({ type: REFRESH_THREADS_EVT });
      break;
    case 'chat:stream:error':
      activeAssistantId.value = null;
      isStreaming.value = false;
      break;
  }
}

export function ChatPage() {
  const route = useRoute();
  const { route: navigate } = useLocation();
  const { routeUpdate } = useAppContext();

  // Thread state
  const threadId = useSignal(route.params?.threadId || '');
  const thread = useSignal<ThreadResponse>({} as ThreadResponse);
  const isStreaming = useSignal(false);
  const activeAssistantId = useSignal<string | null>(null);
  const activeMessage = useSignal<ChatMessage[]>([]);

  // Agent selection (manages list of active agents + selected agent ID)
  const agentSelection = useAgentSelection();

  // Worker event: loads full thread data (metadata + history)
  const fetchThread = useWorkerEvent(
    GET_THREAD_EVT,
    (e) => {
      thread.value = e.detail.data;
      // Auto-select agent if the thread is associated with one
      if (e.detail.data.agent_id != null) {
        agentSelection.selectAgent(e.detail.data.agent_id);
      }
    },
  );

  // When the threadId changes, fetch the thread or create a new one
  useSignalEffect(() => {
    const id = threadId.value;
    if (id) {
      fetchThread({ threadId: id });
      // Check if there's an active stream we can reconnect to
      fireWorkerEvent({ type: RESUME_STREAM_EVT, threadId: id });
    } else {
      chatHistory.loadOrCreateThread().then(newId => {
        navigate(`/chat/${newId}`, true);
      });
    }
  });

  // Listen for route changes emitted by the app router
  useEventListener<RouterEventMap>(
    routeUpdate,
    'route-updated',
    () => {
      const nextPath = window.location.pathname;
      if (!nextPath.startsWith('/chat')) return;

      const newThreadId = nextPath.split('/chat/').pop() || '';
      if (newThreadId !== threadId.value) {
        threadId.value = newThreadId;
      }
    },
  );

  // After each turn completes, re-sync thread history from the server so that
  // in-memory tool-call stubs are replaced with canonical persisted rows.
  // The worker warms the thread-data cache immediately after streaming, so the
  // first emit from fetchThread is near-instant (served from IndexedDB).
  useWorkerEventListener('chat:stream:done', () => {
    if (threadId.value) {
      fetchThread({ threadId: threadId.value });
    }

    console.dir(thread)
  });

  // Handle stream resume — replay snapshot events to rebuild the partial assistant message
  useWorkerEventListener('chat:stream:resume', (e) => {
    const detail = e.detail as StreamResume;
    if (detail.threadId !== threadId.value) return;

    const assistantMsg = buildAssistantMessage(detail.agentName);
    const id = detail.assistantId || assistantMsg.id;
    assistantMsg.id = id;

    activeAssistantId.value = id;
    isStreaming.value = true;

    // Append the empty assistant message to the thread
    thread.value = {
      ...thread.value,
      history: [...(thread.value.history ?? []), assistantMsg],
    };

    // Replay accumulated events to rebuild assistant message state
    for (const event of detail.events) {
      replayStreamEvent(thread, activeAssistantId, isStreaming, event, id);
    }
  });

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full">
        <BaseLayoutShowBtn />
        <ThreadHeader thread={thread} />
      </header>
      <ChatContextProvider value={{ thread, agentSelection, isStreaming, activeAssistantId }}>
        <ChatPageContent />
      </ChatContextProvider>
    </BaseLayout>
  );
}

// ── Chat Page Content ─────────────────────────────────────────────────────────

function ChatPageContent() {
  const { agentSelection, isStreaming, thread } = useChatContext();

  const scrollRef = useRef<HTMLElement>(null);

  // Auto-scroll to the bottom when the message list grows
  useSignalEffect(() => {
    const history = thread.value.history;
    if (!scrollRef.current || !history?.length) return;
    scrollRef.current.scrollTo({ behavior: 'smooth', top: scrollRef.current.scrollHeight });
  });

  const selectedAgentId = agentSelection.selectedAgentId.value;
  const activeThreadId = thread.value.threadId;
  const showPendingPanel = !isStreaming.value && selectedAgentId !== null && !!activeThreadId;

  return (
    <>
      <main className="w-full grow overflow-y-auto pr-4" ref={scrollRef}>
        <ChatList />
      </main>

      {showPendingPanel && (
        <PendingActionsPanel
          agentId={selectedAgentId!}
          threadId={activeThreadId}
        />
      )}

      <footer className="w-full">
        <ChatForm />
      </footer>
    </>
  );
}
