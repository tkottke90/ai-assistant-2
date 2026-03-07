import { useEffect } from "preact/hooks";
import { Signal, useSignal } from "@preact/signals";
import { listArchivedThreads, updateThread, deleteThread } from "@tkottke90/ai-assistant-client";
import type { ThreadMetadata } from "@tkottke90/ai-assistant-client";
import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { ConfirmButton } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/date-utils";
import { Trash2 } from "lucide-preact";

// --- Pure helpers ---

export function archiveRowLabel(thread: ThreadMetadata): string {
  return thread.title ?? "Untitled";
}

// --- Data / action helpers (extracted for independent testability) ---

export async function loadArchivedThreads(
  threads: Signal<ThreadMetadata[]>,
  loading: Signal<boolean>,
): Promise<void> {
  loading.value = true;
  try {
    const data = await listArchivedThreads();
    threads.value = data;
  } catch (err) {
    console.error("Failed to load archived threads:", err);
  } finally {
    loading.value = false;
  }
}

export async function unarchiveThread(threadId: string, reload: () => void): Promise<void> {
  try {
    await updateThread(threadId, { archived: false });
    reload();
  } catch (err) {
    console.error("Failed to unarchive thread:", err);
  }
}

export async function deleteArchivedThread(threadId: string, reload: () => void): Promise<void> {
  try {
    await deleteThread(threadId);
    reload();
  } catch (err) {
    console.error("Failed to delete thread:", err);
  }
}

// --- Component ---

export function ArchivePage() {
  const threads = useSignal<ThreadMetadata[]>([]);
  const loading = useSignal(true);

  const load = () => loadArchivedThreads(threads, loading);

  useEffect(() => {
    load();
  }, []);

  return (
    <BaseLayout className="flex flex-col gap-4 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline text-xl font-semibold">Archive</h2>
        </span>
      </header>

      <main className="w-full grow overflow-y-auto">
        {loading.value && (
          <p className="text-sm text-neutral-400 px-2">Loading...</p>
        )}

        {!loading.value && threads.value.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-12">
            No archived threads
          </p>
        )}

        {!loading.value && threads.value.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-300 dark:border-neutral-600 text-left">
                  <th className="py-2 pr-3 font-medium">Title</th>
                  <th className="py-2 pr-3 font-medium w-28">Last Activity</th>
                  <th className="py-2 font-medium w-36"></th>
                </tr>
              </thead>
              <tbody>
                {threads.value.map(thread => (
                  <tr
                    key={thread.thread_id}
                    className="border-b border-neutral-200 dark:border-neutral-700 last:border-0 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                  >
                    <td className="py-2 pr-3">
                      <a
                        href={`/chat/${thread.thread_id}`}
                        className="hover:underline text-blue-600 dark:text-blue-400"
                      >
                        {archiveRowLabel(thread)}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-neutral-500 dark:text-neutral-400 text-xs whitespace-nowrap">
                      {formatRelativeDate(thread.updated_at)}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => unarchiveThread(thread.thread_id, load)}
                          className="text-xs px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Unarchive
                        </button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon-xs"
                          className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
                          onConfirm={() => deleteArchivedThread(thread.thread_id, load)}
                        >
                          <Trash2 className="size-full" />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </BaseLayout>
  );
}
