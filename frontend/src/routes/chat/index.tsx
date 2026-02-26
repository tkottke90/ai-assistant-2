import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { useRef, useEffect } from "preact/hooks";
import { ChatForm } from "./chat-form";
import type { ChatMessage } from '@tkottke90/ai-assistant-client';
import { Signal, useSignal } from "@preact/signals";
import { ChatMessageDisplay } from "./messages";
import chatHistory from "./chat-history";

const tempChats: ChatMessage[] = [
  { id: '0', type: 'chat_message', role: 'user', content: 'Hello, how are you?', created_at: new Date(), metadata: {}, assets: [] },
  { id: '7', type: 'chat_message', role: 'user', content: 'Hello, how are you?', created_at: new Date(), metadata: {}, assets: [
    { id: 0, url: '/api/v1/assets/1/view', nsfw: false },
    { id: 2, url: '/api/v1/assets/1/view', nsfw: true },
    { id: 3, url: '/api/v1/assets/1/view', nsfw: true },
  ] },
  { id: '1', type: 'chat_message', role: 'assistant', content: 'I am fine, thank you! How can I assist you today?', created_at: new Date(), metadata: {}, assets: [] },
  { id: '2', type: 'chat_message', role: 'user', content: 'Can you tell me a joke?', created_at: new Date(), metadata: {}, assets: [] },
  { id: '3', type: 'chat_message', role: 'assistant', content: 'Sure! Why don\'t scientists trust atoms? Because they make up everything!', created_at: new Date(), metadata: {}, assets: [] },
  { id: '5', type: 'server_action', role: 'system', content: 'Action Taken', actions: [], created_at: new Date(), metadata: {}, severity: 1 },
  { id: '6', type: 'server_action', role: 'system', content: 'There was an error', actions: [], created_at: new Date(), metadata: {}, severity: 2 },
  { id: '4', type: 'server_action', role: 'system', content: 'Approve this action', actions: [
    { label: 'Reject', url: '/api/v1/activity/1/reject', destructive: true },
    { label: 'Approve', url: '/api/v1/activity/1/approve' },
  ], created_at: new Date(), metadata: {} },
]

function ChatList({ messages }: {messages: Signal<ChatMessage[]>}) {
  const scrollableContainer = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!scrollableContainer.current) return;

    scrollableContainer.current?.scrollTo({
      behavior: "smooth",
      top: scrollableContainer.current?.scrollHeight,
    });
  }, [messages.value]);
  
  return (
    <div className="flex flex-col gap-2 pb-8" ref={scrollableContainer} >
      {messages.value.map(message => (
        <ChatMessageDisplay key={message.id} message={message} />
      ))}
    </div>
  )
}

export function ChatPage() {
  const threadId = useSignal('');
  const chatMessages = useSignal<ChatMessage[]>(tempChats);

  useEffect(() => {
    chatHistory.loadCurrentThread().then(id => {
      threadId.value = id;

      chatHistory.getChatHistory(id).then(response => {
        console.log('Loaded chat history:', response);
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
      <main className="w-full grow overflow-y-auto">
        <ChatList messages={chatMessages} />
      </main>
      <footer className="w-full">
        <ChatForm threadId={threadId} />
      </footer>
    </BaseLayout>
  )
}