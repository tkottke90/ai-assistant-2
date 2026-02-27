import type { ChatMessage, InteractionMessage } from '@tkottke90/ai-assistant-client';

export function buildUserMessage(content: string): InteractionMessage {
  return {
    id: crypto.randomUUID(),
    type: 'chat_message',
    role: 'human',
    content,
    created_at: new Date().toISOString(),
    metadata: {},
    assets: [],
  };
}

export function buildAssistantMessage(): InteractionMessage {
  return {
    id: crypto.randomUUID(),
    type: 'chat_message',
    role: 'assistant',
    content: '',
    created_at: new Date().toISOString(),
    metadata: {},
    assets: [],
  };
}

export interface SSEChunk {
  mode: string;
  chunk: Array<{ kwargs?: { content?: string } }>;
}

export function parseMessagesChunk(line: string): string | null {
  if (!line.startsWith('data: ')) return null;

  try {
    const data: SSEChunk = JSON.parse(line.slice(6));
    if (data.mode !== 'messages') return null;
    return data.chunk[0]?.kwargs?.content ?? null;
  } catch {
    return null;
  }
}

export function isDoneEvent(line: string): boolean {
  return line.startsWith('done: ');
}

export function appendToMessage(
  messages: ChatMessage[],
  id: string,
  content: string,
): ChatMessage[] {
  return messages.map(msg => {
    if (msg.id !== id || msg.type !== 'chat_message') return msg;
    return { ...msg, content: msg.content + content };
  });
}
