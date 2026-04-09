import { Button, ConfirmButton } from "@/components/ui/button";
import { Signal, useSignal } from "@preact/signals";
import { summarizeThread, updateThread, deleteThread, type ThreadResponse } from "@tkottke90/ai-assistant-client";
import { Sparkles, Archive, Trash2 } from "lucide-react";
import { useLocation } from "preact-iso";
import { useChatContext } from "./chat-context";
import { fireWorkerEvent } from "@/lib/workerClient";
import { REFRESH_THREADS_EVT } from "@/lib/chat";
import { truncate } from "@/lib/string.utils";

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
): Promise<void> {
  try {
    await updateThread(threadId, { archived: true });
    fireWorkerEvent({ type: REFRESH_THREADS_EVT });
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
    fireWorkerEvent({ type: REFRESH_THREADS_EVT });
    onSuccess();
  } catch (err) {
    console.error("Failed to delete thread:", err);
  }
}

export function ThreadHeader({ thread }: { thread: Signal<ThreadResponse>}) {
  const summarizing = useSignal(false);

  const { route } = useLocation();

  const handleSummarize = async () => {
    if (!thread.value) return;
    summarizing.value = true;
    await summarizeAndUpdateTitle(thread.value.threadId, (title) => {
      thread.value = { ...thread.value, title: title ?? '' };
      fireWorkerEvent({ type: REFRESH_THREADS_EVT });
    });
    summarizing.value = false;
  };

  if (!thread.value) return null;

  return (
    <div className="flex grow min-w-0 gap-4 items-center justify-between py-1.5 border-b border-neutral-200 dark:border-neutral-700 text-sm">
      <h2 className="truncate min-w-0 flex-1">{thread.value.agent?.name ?? thread.value?.title ?? 'Chat'}</h2>
      <div className="flex items-center gap-1 text-neutral-400 shrink-0">
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
            onClick={() => archiveThreadById(thread.value.threadId)}
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
          onConfirm={() => deleteThreadById(thread.value.threadId, () => route('/'))}
          title="Delete thread"
        >
          <Trash2 size={14} />
        </ConfirmButton>
      </div>
    </div>
  );
}