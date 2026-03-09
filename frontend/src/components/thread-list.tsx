import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { listThreads, newThread, updateThread } from "@tkottke90/ai-assistant-client";
import type { ThreadMetadata, AgentThread, ThreadsResponse } from "@tkottke90/ai-assistant-client";
import { useLocation } from "preact-iso";
import { Plus, MessageSquare, Archive, Bot } from "lucide-preact";
import { Button } from "./ui/button";
import { formatRelativeDate } from "@/lib/date-utils";
import { useWorkerEvent, fireWorkerEvent } from "@/lib/workerClient";
import { REFRESH_THREADS_EVT } from "@/lib/chat";

/**
 * Format a thread's display label. Use title if available, otherwise fall back to a date string.
 */
export function threadDisplayLabel(thread: ThreadMetadata): string {
  if (thread.title) return thread.title;
  return formatRelativeDate(thread.created_at);
}

/**
 * Determine if a thread ID matches the currently active thread from the URL path.
 */
export function isActiveThread(threadId: string, currentPath: string): boolean {
  return currentPath === `/chat/${threadId}`;
}

// --- Sub-components ---

interface AgentThreadsSectionProps {
  agentThreads: AgentThread[];
  currentPath: string;
}

function AgentThreadsSection({ agentThreads, currentPath }: AgentThreadsSectionProps) {
  if (agentThreads.length === 0) return null;

  return (
    <div className="mb-1">
      <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Agent Threads
      </span>
      {agentThreads.map(t => {
        const active = isActiveThread(t.thread_id, currentPath);
        return (
          <a
            key={t.thread_id}
            href={`/chat/${t.thread_id}`}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors truncate
              ${active
                ? "bg-neutral-300 dark:bg-neutral-700 font-medium"
                : "hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
              }`}
            title={t.agentName}
          >
            <Bot size={14} className="shrink-0" />
            <span className="truncate">{t.agentName}</span>
          </a>
        );
      })}
    </div>
  );
}

interface ThreadRowProps {
  thread: ThreadMetadata;
  active: boolean;
  onArchive: (threadId: string) => void;
}

function ThreadRow({ thread, active, onArchive }: ThreadRowProps) {
  const hovered = useSignal(false);

  return (
    <a
      href={`/chat/${thread.thread_id}`}
      className={`group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors
        ${active
          ? "bg-neutral-300 dark:bg-neutral-700 font-medium"
          : "hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
        }`}
      title={thread.thread_id}
      onMouseEnter={() => { hovered.value = true; }}
      onMouseLeave={() => { hovered.value = false; }}
    >
      <MessageSquare size={14} className="shrink-0" />
      <span className="truncate flex-1">{threadDisplayLabel(thread)}</span>
      {hovered.value && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onArchive(thread.thread_id);
          }}
          className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 shrink-0"
          title="Archive thread"
        >
          <Archive size={14} />
        </button>
      )}
    </a>
  );
}

// --- Main Component ---

export function ThreadList() {
  const threads = useSignal<ThreadMetadata[]>([]);
  const agentThreads = useSignal<AgentThread[]>([]);
  const loading = useSignal(true);
  const { url: currentPath, route: navigate } = useLocation();

  const sendRefresh = useWorkerEvent(
    REFRESH_THREADS_EVT,
    (e) => {
      threads.value = e.detail.data.threads;
      agentThreads.value = e.detail.data.agentThreads;
      loading.value = false;
    },
  );

  // Initial load on mount
  useEffect(() => {
    sendRefresh({});
  }, []);

  const handleNewChat = async () => {
    try {
      const { thread_id } = await newThread();
      fireWorkerEvent({ type: REFRESH_THREADS_EVT });
      navigate(`/chat/${thread_id}`);
    } catch (err) {
      console.error("Failed to create new thread:", err);
    }
  };

  const handleArchive = async (threadId: string) => {
    try {
      await updateThread(threadId, { archived: true });
      fireWorkerEvent({ type: REFRESH_THREADS_EVT });
    } catch (err) {
      console.error("Failed to archive thread:", err);
    }
  };

  return (
    <div className="flex flex-col gap-1 px-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Threads</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleNewChat}
          title="New Chat"
        >
          <Plus size={14} />
        </Button>
      </div>

      {loading.value && (
        <span className="text-xs text-neutral-400 px-2">Loading...</span>
      )}

      {!loading.value && (
        <>
          <AgentThreadsSection agentThreads={agentThreads.value} currentPath={currentPath} />
          {agentThreads.value.length > 0 && (
            <hr className="border-neutral-500/30 my-1 mx-2" />
          )}
          {threads.value.length === 0 && (
            <span className="text-xs text-neutral-400 px-2">No threads yet</span>
          )}
          {threads.value.map(thread => (
            <ThreadRow
              key={thread.thread_id}
              thread={thread}
              active={isActiveThread(thread.thread_id, currentPath)}
              onArchive={handleArchive}
            />
          ))}
          <a
            href="/archive"
            className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            View Archive →
          </a>
        </>
      )}
    </div>
  );
}
