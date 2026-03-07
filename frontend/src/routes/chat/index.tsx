import BaseLayout, { BaseLayoutShowBtn, useAppContext } from "@/components/layouts/base.layout";
import { useRef, useEffect } from "preact/hooks";
import { ChatForm } from "./chat-form";
import { listThreads, updateThread, deleteThread, summarizeThread } from '@tkottke90/ai-assistant-client';
import {
  listPendingActions,
  resolveAgentAction,
  type AgentAction,
  type ChatMessage,
  type ThreadMetadata
} from '@tkottke90/ai-assistant-client';
import { Signal, useSignal } from "@preact/signals";
import { ChatMessageDisplay } from "./messages";
import chatHistory from "./chat-history";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { useAgentSelection } from "@/hooks/use-agent-selection";
import { selectedAgentName } from "./agent-chips";
import { useRoute, useLocation } from "preact-iso";
import { Sparkles, Archive, Trash2 } from "lucide-preact";
import { ConfirmButton } from "@/components/ui/button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ── Pure utility functions ───────────────────────────────────────────────────

/** Returns a human-readable relative expiry string, e.g. "in 4 minutes". */
function formatExpiry(expiresAt: Date): string {
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return 'expired';
  const mins = Math.ceil(diffMs / 60_000);
  return mins === 1 ? 'in 1 minute' : `in ${mins} minutes`;
}

/** Tailwind colour classes for action danger level badges. */
function dangerBadgeClass(dangerLevel: string): string {
  switch (dangerLevel) {
    case 'high':  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'medium': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default:       return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
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
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${dangerBadgeClass('medium')}`}>
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

  useEffect(() => {
    listPendingActions({ agentId })
      .then(all => { actions.value = all.filter(a => a.thread_id === threadId); })
      .catch(() => { /* silently ignore */ });
  }, [agentId, threadId]);

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

function ChatList({ messages }: {messages: Signal<ChatMessage[]>}) {
  return (
    <div className="flex flex-col gap-2 pb-8">
      {messages.value.map(message => (
        <ChatMessageDisplay key={message.id} message={message} />
      ))}
    </div>
  );
}

// --- Thread Header ---

interface ThreadHeaderProps {
  threadId: Signal<string>;
  threadTitle: Signal<string | null>;
  onNavigateHome: () => void;
  onRefreshThreads: () => void;
}

function ThreadHeader({ threadId, threadTitle, onNavigateHome, onRefreshThreads }: ThreadHeaderProps) {
  const summarizing = useSignal(false);

  const handleSummarize = async () => {
    if (!threadId.value) return;
    summarizing.value = true;
    try {
      const { title } = await summarizeThread(threadId.value);
      threadTitle.value = title;
      onRefreshThreads();
    } catch (err) {
      console.error("Failed to summarize thread:", err);
    } finally {
      summarizing.value = false;
    }
  };

  const handleArchive = async () => {
    if (!threadId.value) return;
    try {
      await updateThread(threadId.value, { archived: true });
      onRefreshThreads();
      onNavigateHome();
    } catch (err) {
      console.error("Failed to archive thread:", err);
    }
  };

  const handleDelete = async () => {
    if (!threadId.value) return;
    try {
      await deleteThread(threadId.value);
      onRefreshThreads();
      onNavigateHome();
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

  if (!threadId.value) return null;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-700 text-sm">
      <span className="font-medium truncate text-neutral-700 dark:text-neutral-300">
        {threadTitle.value ?? "Untitled Thread"}
      </span>
      <div className="flex items-center gap-1 text-neutral-400">
        <button
          onClick={handleSummarize}
          disabled={summarizing.value}
          title="Summarize thread"
          className="p-1 rounded hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
        >
          <Sparkles size={14} />
        </button>
        <button
          onClick={handleArchive}
          title="Archive thread"
          className="p-1 rounded hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        >
          <Archive size={14} />
        </button>
        <ConfirmButton
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
          onConfirm={handleDelete}
          title="Delete thread"
        >
          <Trash2 size={14} />
        </ConfirmButton>
      </div>
    </div>
  );
}

// --- Chat Page ---

function ChatPageContent() {
  const route = useRoute();
  const { route: navigate } = useLocation();
  const { threadRefresh } = useAppContext();
  const threadId = useSignal('');
  const threadTitle = useSignal<string | null>(null);
  const chatMessages = useSignal<ChatMessage[]>([]);
  const isStreaming = useSignal(false);
  const pendingPanelKey = useSignal(0);
  const chatRefreshKey = useSignal(0);
  const scrollContainer = useRef<HTMLElement>(null);
  const llmSelection = useLlmSelection();
  const agentSelection = useAgentSelection();

  const currentAgentName = selectedAgentName(
    agentSelection.activeAgents.value,
    agentSelection.selectedAgentId.value,
  );

  useEffect(() => {
    if (!scrollContainer.current) return;
    scrollContainer.current.scrollTo({
      behavior: 'smooth',
      top: scrollContainer.current.scrollHeight,
    });
  }, [chatMessages.value]);

  useEffect(() => {
    const routeThreadId = route.params?.threadId;

    if (routeThreadId) {
      threadId.value = routeThreadId;
      chatHistory.getChatHistory(routeThreadId).then(response => {
        chatMessages.value = response.history;
      });

      // Load thread metadata to get title and auto-select agent
      listThreads().then(({ threads, agentThreads }) => {
        const all = [...agentThreads, ...threads] as ThreadMetadata[];
        const meta = all.find(t => t.thread_id === routeThreadId);
        if (meta) {
          threadTitle.value = meta.title ?? null;
          if (meta.agent_id != null) {
            agentSelection.selectAgent(meta.agent_id);
          }
        } else {
          threadTitle.value = null;
        }
      });
    } else {
      chatHistory.loadOrCreateThread().then(id => {
        navigate(`/chat/${id}`, true);
      });
      return;
    }

    threadId.value = routeThreadId;
    chatHistory.getChatHistory(routeThreadId).then(response => {
      chatMessages.value = response.history;
    });
  }, [route.params?.threadId, chatRefreshKey.value]);

  // Re-mount the pending actions panel whenever streaming ends so it picks up new requests.
  useEffect(() => {
    if (!isStreaming.value) {
      pendingPanelKey.value += 1;
    }
  }, [isStreaming.value]);

  const selectedAgentId = agentSelection.selectedAgentId.value;
  const activeThreadId = threadId.value;
  const showPendingPanel = !isStreaming.value && selectedAgentId !== null && activeThreadId !== '';

  return (
    <>
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Chat</h2>
        </span>
        <span>
          {currentAgentName && (
            <span className="text-sm text-muted-foreground">
              with <span className="font-medium">{currentAgentName}</span>
            </span>
          )}
        </span>
      </header>
      <ThreadHeader
        threadId={threadId}
        threadTitle={threadTitle}
        onNavigateHome={() => navigate('/')}
        onRefreshThreads={() => { threadRefresh.value += 1; }}
      />
      <main className="w-full grow overflow-y-auto pr-4" ref={scrollContainer}>
        <ChatList messages={chatMessages} />
      </main>
      {showPendingPanel && (
        <PendingActionsPanel
          key={pendingPanelKey.value}
          agentId={selectedAgentId!}
          threadId={activeThreadId}
          onResolved={() => {
            threadRefresh.value += 1;
            // Delay refresh slightly so the backend has time to persist the resumed agent messages
            setTimeout(() => { chatRefreshKey.value += 1; }, 2000);
          }}
        />
      )}
      <footer className="w-full">
        <ChatForm
          threadId={threadId}
          chatMessages={chatMessages}
          isStreaming={isStreaming}
          llmSelection={llmSelection}
          agentSelection={agentSelection}
          onMessageSent={() => {
            threadRefresh.value += 1;
            pendingPanelKey.value += 1;
          }}
        />
      </footer>
    </>
  );
}

export function ChatPage() {
  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <ChatPageContent />
    </BaseLayout>
  );
}