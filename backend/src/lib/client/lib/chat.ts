import z from 'zod';
import {
  ChatMessage,
  ChatAsset,
  ServerAction,
  ChatMessageSchema,
  InteractionMessage,
  threadHistoryResponseSchema
} from '../../models/chat.js';


function listThreads(): Promise<string[]> {
  return fetch('/api/v1/chat/threads')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data.threads as string[];
    });
}

function newThread(): Promise<{ threadId: string }> {
  return fetch('/api/v1/chat/new-thread', {
    method: 'POST',
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as { threadId: string };
    });
}

function getThreadHistory(threadId: string) {
  return fetch(`/api/v1/chat/${threadId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as z.infer<typeof threadHistoryResponseSchema>;
    });
}


export {
  ChatMessage,
  ChatAsset,
  ServerAction,
  ChatMessageSchema,
  InteractionMessage,
  getThreadHistory,
  newThread
}