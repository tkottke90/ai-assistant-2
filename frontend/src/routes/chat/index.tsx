import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { useAgentSelection } from "@/hooks/use-agent-selection";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import {
  resolveAgentAction,
  type ThreadResponse,
  type AgentAction,
  type ChatMessage,
} from '@tkottke90/ai-assistant-client';
import { useLocation, useRoute } from "preact-iso";
import { useRef } from "preact/hooks";
import { toast } from "sonner";
import { selectedAgentName } from "./agent-chips";
import { ChatForm } from "./chat-form";
import chatHistory from "./chat-history";
import { ChatMessageDisplay } from "./messages";
import { useWorkerEvent } from "@/lib/workerClient";
import { ThreadHeader } from "./thread-header";
import { GET_THREAD_EVT } from "@/lib/chat";
import { type RouterEventMap, useAppContext } from '@/app-context';
import { useEventListener } from "@/lib/html-utils";
import { ChatContextProvider, useChatContext } from "./chat-context";

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

function PendingActionsPanel({ agentId, threadId, onResolved }: {
  agentId: number;
  threadId: string;
  onResolved: () => void;
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
            onResolved();
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

export function ChatPage() {
  const route = useRoute();
  const { route: navigate } = useLocation();
  const { routeUpdate } = useAppContext();

  // Thread state
  const threadId = useSignal(route.params?.threadId || '');
  const thread = useSignal<ThreadResponse>({} as ThreadResponse);
  const isStreaming = useSignal(false);

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

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <ChatContextProvider value={{ thread, agentSelection, isStreaming }}>
        <ChatPageContent />
      </ChatContextProvider>
    </BaseLayout>
  );
}

// ── Chat Page Content ─────────────────────────────────────────────────────────

function ChatPageContent() {
  const { agentSelection, isStreaming, thread } = useChatContext();
  const { threadRefresh } = useAppContext();

  const agentName = useComputed(() =>
    selectedAgentName(agentSelection.activeAgents.value, agentSelection.selectedAgentId.value)
  );

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

  const handleRefreshThreads = () => { threadRefresh.value += 1; };

  return (
    <>
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Chat</h2>
        </span>
        {agentName.value && (
          <span className="text-sm text-muted-foreground">
            with <span className="font-medium">{agentName.value}</span>
          </span>
        )}
      </header>

      <ThreadHeader
        onRefreshThreads={handleRefreshThreads}
      />

      <main className="w-full grow overflow-y-auto pr-4" ref={scrollRef}>
        <ChatList />
      </main>

      {showPendingPanel && (
        <PendingActionsPanel
          agentId={selectedAgentId!}
          threadId={activeThreadId}
          onResolved={handleRefreshThreads}
        />
      )}

      <footer className="w-full">
        <ChatForm onMessageSent={handleRefreshThreads} />
      </footer>
    </>
  );
}
