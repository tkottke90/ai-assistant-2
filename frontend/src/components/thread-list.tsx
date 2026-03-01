import { useEffect } from "preact/hooks";
import { Signal, useSignal } from "@preact/signals";
import { listThreads, newThread } from "@tkottke90/ai-assistant-client";
import { useLocation } from "preact-iso";
import { Plus, MessageSquare } from "lucide-preact";
import { Button } from "./ui/button";

/**
 * Truncate a UUID to the first 8 characters for display.
 */
export function truncateThreadId(threadId: string): string {
  return threadId.slice(0, 8);
}

/**
 * Determine if a thread ID matches the currently active thread from the URL path.
 */
export function isActiveThread(threadId: string, currentPath: string): boolean {
  return currentPath === `/chat/${threadId}`;
}

interface ThreadListProps {
  refreshSignal: Signal<number>;
}

export function ThreadList({ refreshSignal }: ThreadListProps) {
  const threads = useSignal<string[]>([]);
  const loading = useSignal(true);
  const { url: currentPath, route: navigate } = useLocation();

  useEffect(() => {
    loading.value = true;
    listThreads()
      .then((result: string[]) => {
        threads.value = result;
      })
      .catch((err: Error) => {
        console.error("Failed to load threads:", err);
      })
      .finally(() => {
        loading.value = false;
      });
  }, [refreshSignal.value]);

  const handleNewChat = async () => {
    try {
      const { threadId } = await newThread();
      refreshSignal.value += 1;
      navigate(`/chat/${threadId}`);
    } catch (err) {
      console.error("Failed to create new thread:", err);
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

      {!loading.value && threads.value.length === 0 && (
        <span className="text-xs text-neutral-400 px-2">No threads yet</span>
      )}

      {threads.value.map(threadId => {
        const active = isActiveThread(threadId, currentPath);
        return (
          <a
            key={threadId}
            href={`/chat/${threadId}`}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors truncate
              ${active
                ? "bg-neutral-300 dark:bg-neutral-700 font-medium"
                : "hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
              }`}
            title={threadId}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span className="truncate">{truncateThreadId(threadId)}</span>
          </a>
        );
      })}
    </div>
  );
}
