import z from 'zod';
import {
  ActionSeverity,
  ChatMessage,
  ChatAsset,
  ServerAction,
  ChatMessageSchema,
  InteractionMessage,
  threadHistoryResponseSchema
} from '../../models/chat.js';

// --- Thread Metadata Types ---

export interface ThreadMetadata {
  thread_id: string;
  agent_id: number | null;
  type: 'chat' | 'agent';
  title: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentThread extends ThreadMetadata {
  agentName: string;
}

export interface ThreadsResponse {
  threads: ThreadMetadata[];
  agentThreads: AgentThread[];
}

// --- Thread API Functions ---

function listThreads(): Promise<ThreadsResponse> {
  return fetch('/api/v1/chat/threads')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as ThreadsResponse;
    });
}

function listArchivedThreads(): Promise<ThreadMetadata[]> {
  return fetch('/api/v1/chat/threads?archived=true')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data.threads as ThreadMetadata[];
    });
}

function newThread(options?: { agent_id?: number; type?: 'chat' | 'agent' }): Promise<{ thread_id: string }> {
  return fetch('/api/v1/chat/new-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as { thread_id: string };
    });
}

function getThread(threadId: string): Promise<ThreadMetadata> {
  return fetch(`/api/v1/chat/threads/${threadId}`)
    .then(res => {
      if (res.status === 404) throw new Error('Thread not found');
      return res.json();
    })
    .then(data => {
      if ((data as any).error) throw new Error((data as any).error);
      return data as ThreadMetadata;
    });
}

function updateThread(
  threadId: string,
  data: Partial<Pick<ThreadMetadata, 'title' | 'archived' | 'agent_id'>>,
): Promise<ThreadMetadata> {
  return fetch(`/api/v1/chat/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(res => res.json())
    .then(result => {
      if ((result as any).error) {
        throw new Error((result as any).error);
      }
      return result as ThreadMetadata;
    });
}

function deleteThread(threadId: string): Promise<void> {
  return fetch(`/api/v1/chat/threads/${threadId}`, {
    method: 'DELETE',
  }).then(res => {
    if (!res.ok) {
      throw new Error(`Failed to delete thread: ${res.statusText}`);
    }
  });
}

function summarizeThread(threadId: string): Promise<{ title: string }> {
  return fetch(`/api/v1/chat/threads/${threadId}/summarize`, {
    method: 'POST',
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as { title: string };
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
  ActionSeverity,
  ChatMessage,
  ChatAsset,
  ServerAction,
  ChatMessageSchema,
  InteractionMessage,
  getThreadHistory,
  getThread,
  listThreads,
  listArchivedThreads,
  newThread,
  updateThread,
  deleteThread,
  summarizeThread,
}