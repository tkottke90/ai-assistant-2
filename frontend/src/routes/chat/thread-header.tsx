import { Button, ConfirmButton } from "@/components/ui/button";
import { useSignal } from "@preact/signals";
import { summarizeThread, updateThread, deleteThread } from "@tkottke90/ai-assistant-client";
import { Sparkles, Archive, Trash2 } from "lucide-react";
import { useLocation } from "preact-iso";
import { useChatContext } from "./chat-context";

export async function summarizeAndUpdateTitle(
  threadId: string,
  onSuccess: (title: string) => void,
): Promise<void> {
  try {
    const { title } = await summarizeThread(threadId);
    onSuccess(title);
  } catch (err) {
    console.error("Failed to summarize thread:", err);
  }
}

export async function archiveThreadById(
  threadId: string,
  onSuccess: () => void,
): Promise<void> {
  try {
    await updateThread(threadId, { archived: true });
    onSuccess();
  } catch (err) {
    console.error("Failed to archive thread:", err);
  }
}

export async function deleteThreadById(
  threadId: string,
  onSuccess: () => void,
): Promise<void> {
  try {
    await deleteThread(threadId);
    onSuccess();
  } catch (err) {
    console.error("Failed to delete thread:", err);
  }
}

interface ThreadHeaderProps {
  onRefreshThreads: () => void;
}

export function ThreadHeader({ onRefreshThreads }: ThreadHeaderProps) {
  const { thread } = useChatContext();
  const summarizing = useSignal(false);

  const { route } = useLocation();

  const handleSummarize = async () => {
    if (!thread.value) return;

    // Set the state to show loading/summarizing status in the UI
    summarizing.value = true;

    // Call the summarize endpoint
    await summarizeAndUpdateTitle(thread.value.threadId, (title) => {

      // Update the thread signal with the new title
      thread.value = {
        ...thread.value,
        title: title ?? ''
      };
      onRefreshThreads();
    });

    // Reset the summarizing state
    summarizing.value = false;
  };

  if (!thread.value) return null;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-700 text-sm">
      <span className="font-medium truncate text-neutral-700 dark:text-neutral-300">
        {thread.value.title ?? "Untitled Thread"}
      </span>
      <div className="flex items-center gap-1 text-neutral-400">
        <Button
          onClick={handleSummarize}
          disabled={summarizing.value}
          title="Summarize thread"
          className="p-1 rounded hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
          variant="ghost"
          size="icon"
        >
          <Sparkles size={14} />
        </Button>
        {!thread.value.archived && (
          <Button
            onClick={() => archiveThreadById(thread.value.threadId, () => {
              onRefreshThreads();
            })}
            title="Archive thread"
            className="p-1 rounded hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            variant="ghost"
            size="icon"
          >
            <Archive size={14} />
          </Button>
        )}
        <ConfirmButton
          variant="ghost"
          size="icon"
          className="p-1 text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
          onConfirm={() => deleteThreadById(thread.value.threadId, () => {
            onRefreshThreads();
            
            // Route home because the thread was deleted
            route('/');
          })}
          title="Delete thread"
        >
          <Trash2 size={14} />
        </ConfirmButton>
      </div>
    </div>
  );
}