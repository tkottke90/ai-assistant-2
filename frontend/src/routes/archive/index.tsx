import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useLocation } from "preact-iso";
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

export function archiveAgentLabel(thread: ThreadMetadata & { agent?: { name: string } | null }): string {
  return (thread as any).agent?.name ?? "—";
}

// --- Component ---

export function ArchivePage() {
  const threads = useSignal<ThreadMetadata[]>([]);
  const loading = useSignal(true);
  const { route: navigate } = useLocation();

  const load = async () => {
    loading.value = true;
    try {
      const data = await listArchivedThreads();
      threads.value = data;
    } catch (err) {
      console.error("Failed to load archived threads:", err);
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUnarchive = async (threadId: string) => {
    try {
      await updateThread(threadId, { archived: false });
      load();
    } catch (err) {
      console.error("Failed to unarchive thread:", err);
    }
  };

  const handleDelete = async (threadId: string) => {
    try {
      await deleteThread(threadId);
      load();
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

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
                  <th className="py-2 pr-3 font-medium w-32">Agent</th>
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
                    <td className="py-2 pr-3 text-neutral-500 dark:text-neutral-400">
                      {archiveAgentLabel(thread)}
                    </td>
                    <td className="py-2 pr-3 text-neutral-500 dark:text-neutral-400 text-xs whitespace-nowrap">
                      {formatRelativeDate(thread.updated_at)}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleUnarchive(thread.thread_id)}
                          className="text-xs px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Unarchive
                        </button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon-xs"
                          className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
                          onConfirm={() => handleDelete(thread.thread_id)}
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
