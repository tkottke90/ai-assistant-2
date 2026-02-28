import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { useRef, useEffect } from "preact/hooks";
import { ChatForm } from "./chat-form";
import type { ChatMessage } from '@tkottke90/ai-assistant-client';
import { Signal, useSignal } from "@preact/signals";
import { ChatMessageDisplay } from "./messages";
import chatHistory from "./chat-history";
import { useLlmSelection } from "@/hooks/use-llm-selection";

function ChatList({ messages }: {messages: Signal<ChatMessage[]>}) {
  return (
    <div className="flex flex-col gap-2 pb-8">
      {messages.value.map(message => (
        <ChatMessageDisplay key={message.id} message={message} />
      ))}
    </div>
  );
}

export function ChatPage() {
  const threadId = useSignal('');
  const chatMessages = useSignal<ChatMessage[]>([]);
  const isStreaming = useSignal(false);
  const scrollContainer = useRef<HTMLElement>(null);
  const llmSelection = useLlmSelection();

  useEffect(() => {
    if (!scrollContainer.current) return;
    scrollContainer.current.scrollTo({
      behavior: 'smooth',
      top: scrollContainer.current.scrollHeight,
    });
  }, [chatMessages.value]);

  useEffect(() => {
    chatHistory.loadCurrentThread().then(id => {
      threadId.value = id;

      chatHistory.getChatHistory(id).then(response => {
        chatMessages.value = response.history;
      });
    });
  }, []);

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Chat</h2>
        </span>
        <span>

        </span>
      </header>
      <main className="w-full grow overflow-y-auto pr-4" ref={scrollContainer}>
        <ChatList messages={chatMessages} />
      </main>
      <footer className="w-full">
        <ChatForm
          threadId={threadId}
          chatMessages={chatMessages}
          isStreaming={isStreaming}
          llmSelection={llmSelection}
        />
      </footer>
    </BaseLayout>
  )
}