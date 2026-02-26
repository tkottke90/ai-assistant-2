import { Button } from "@/components/ui/button";
import type { Signal } from "@preact/signals";
import { SendHorizonal } from "lucide-preact";
import { toast } from "sonner";
import type { ChatMessage } from "@tkottke90/ai-assistant-client";
import {
  buildUserMessage,
  buildAssistantMessage,
  parseMessagesChunk,
  isDoneEvent,
  appendToMessage,
} from "./chat-utils";

export function createSubmitHandler(
  chatMessages: Signal<ChatMessage[]>,
  isStreaming: Signal<boolean>,
) {
  return async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const message = formData.get('message') as string;
    const threadId = formData.get('threadId') as string;

    if (!message.trim()) return;

    form.reset();
    form.querySelector('#threadId')?.setAttribute('value', threadId);

    const userMessage = buildUserMessage(message);
    const assistantMessage = buildAssistantMessage();
    const assistantId = assistantMessage.id;

    chatMessages.value = [...chatMessages.value, userMessage, assistantMessage];
    isStreaming.value = true;

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, threadId }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value);
        const lines = raw.split('\n\n');

        for (const line of lines) {
          if (isDoneEvent(line)) break;

          const content = parseMessagesChunk(line);
          if (content) {
            chatMessages.value = appendToMessage(chatMessages.value, assistantId, content);
          }
        }
      }
    } catch (err) {
      console.error('Chat stream error:', err);
      toast.error('Failed to get a response. Please try again.');
      // Remove the empty assistant placeholder on failure
      chatMessages.value = chatMessages.value.filter(msg => msg.id !== assistantId);
    } finally {
      isStreaming.value = false;
    }
  };
}

interface ChatFormProps {
  threadId: Signal<string>;
  chatMessages: Signal<ChatMessage[]>;
  isStreaming: Signal<boolean>;
}

export function ChatForm({ threadId, chatMessages, isStreaming }: ChatFormProps) {
  const handleSubmit = createSubmitHandler(chatMessages, isStreaming);

  return (
    <form className="w-full flex flex-row gap-2"
      onSubmit={handleSubmit}
    >
      <input type="text" hidden id="threadId" name="threadId" value={threadId.value} />

      <div className="w-full border border-neutral-500/50 rounded-md">
        <div id="file-container" className="flex gap-2"></div>

        <textarea
          className="w-full h-24 p-2 rounded-md focus:ring-0 focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Type your message here..."
          name="message"
          disabled={isStreaming.value}
        />
      </div>

      <Button variant="default" type="submit" disabled={isStreaming.value}>
        <span class="hidden lg:inline">Send</span>
        <SendHorizonal size={20} class="inline lg:hidden" />
      </Button>

    </form>
  );
}
