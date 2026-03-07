import BaseLayout, { BaseLayoutShowBtn, useAppContext } from "@/components/layouts/base.layout";
import { useRef, useEffect } from "preact/hooks";
import { ChatForm } from "./chat-form";
import type { ChatMessage, ThreadMetadata } from '@tkottke90/ai-assistant-client';
import { listThreads, updateThread, deleteThread, summarizeThread } from '@tkottke90/ai-assistant-client';
import { Signal, useSignal } from "@preact/signals";
import { ChatMessageDisplay } from "./messages";
import chatHistory from "./chat-history";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { useAgentSelection } from "@/hooks/use-agent-selection";
import { selectedAgentName } from "./agent-chips";
import { useRoute, useLocation } from "preact-iso";
import { Sparkles, Archive, Trash2 } from "lucide-preact";
import { ConfirmButton } from "@/components/ui/button";

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
    }
  }, [route.params?.threadId]);

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
      <footer className="w-full">
        <ChatForm
          threadId={threadId}
          chatMessages={chatMessages}
          isStreaming={isStreaming}
          llmSelection={llmSelection}
          agentSelection={agentSelection}
          onMessageSent={() => { threadRefresh.value += 1; }}
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