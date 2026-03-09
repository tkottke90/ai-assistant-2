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

/**
 * @param name Optional agent name used for the avatar. Defaults to 'assistant'
 *             until `chat:stream:agent_name` arrives from the worker.
 */
export function buildAssistantMessage(name?: string): InteractionMessage {
  return {
    id: crypto.randomUUID(),
    type: 'chat_message',
    role: 'assistant',
    name,
    content: '',
    created_at: new Date().toISOString(),
    metadata: {},
    assets: [],
  };
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

export function patchMessage(
  messages: ChatMessage[],
  id: string,
  patch: Partial<InteractionMessage>,
): ChatMessage[] {
  return messages.map(msg => {
    if (msg.id !== id || msg.type !== 'chat_message') return msg;
    return { ...msg, ...patch, metadata: { ...msg.metadata, ...patch.metadata } };
  });
}
