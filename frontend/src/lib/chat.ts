import {
  getThreadHistory,
  listThreads,
  type InteractionMessage,
  type ThreadResponse,
  type ThreadsResponse,
} from '@tkottke90/ai-assistant-client';
import type { inferResponseEvents } from './worker-event.types';
import { cacheGet, cachePut } from './cache';

// ---------------------------------------------------------------------------
// Streaming chat event infrastructure
// ---------------------------------------------------------------------------

export const STREAM_CHAT_EVT = 'chat:stream' as const;

export interface StreamChatMessage {
  type: typeof STREAM_CHAT_EVT;
  message: string;
  threadId: string;
  alias?: string;
  model?: string;
  agentId?: number;
  agentName?: string;
  assistantId?: string;
}

/**
 * Internal discriminated union used by the worker to classify raw stream lines.
 * Never sent to the main thread — coalesced into WorkerStreamEvent instead.
 */
export type StreamChunk =
  | { kind: 'chat'; content: any }
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool_call_start'; id: string; name: string }
  | { kind: 'tool_result'; toolCallId: string; content: string; name: string }
  | { kind: 'agent_name'; name: string }
  | { kind: 'final_response'; usage?: InteractionMessage['usage']; model?: string; name?: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  | { kind: 'skip' };

// Outbound events sent from the worker to the main thread
export type StreamChatStart       = { type: 'chat:stream:start', message: string, assistantName?: string };
export type StreamChat            = { type: 'chat:stream:data'; content: any };
export type StreamDone            = { type: 'chat:stream:done' };
export type StreamError           = { type: 'chat:stream:error';            error: string };

export type StreamTextDelta       = { type: 'chat:stream:text_delta';       content: string };
export type StreamThinking        = { type: 'chat:stream:thinking';         content: string };
export type StreamToolCallStart   = { type: 'chat:stream:tool_call_start';  id: string; name: string };
export type StreamToolCallComplete= { type: 'chat:stream:tool_call_complete'; id: string; args: string };
export type StreamToolResult      = { type: 'chat:stream:tool_result';      toolCallId: string; content: string; summary: string };
export type StreamAgentName       = { type: 'chat:stream:agent_name';       name: string };
export type StreamFinalResponse   = { type: 'chat:stream:final_response';   usage?: InteractionMessage['usage']; model?: string; name?: string };

export type StreamResume          = {
  type: 'chat:stream:resume';
  threadId: string;
  assistantId: string;
  agentName?: string;
  events: WorkerStreamEvent[];
};
export type StreamResumeNone      = { type: 'chat:stream:resume:none';      threadId: string };

export type WorkerStreamEvent =
  | StreamChat
  | StreamChatStart
  | StreamTextDelta
  | StreamThinking
  | StreamToolCallStart
  | StreamToolCallComplete
  | StreamToolResult
  | StreamAgentName
  | StreamFinalResponse
  | StreamDone
  | StreamError;

export type WorkerStreamControlEvent =
  | StreamResume
  | StreamResumeNone;

/**
 * Worker-side streaming handler. Owns the fetch + stream reader loop, classifies
 * each line, coalesces thinking tokens (debounced) and tool call args (buffered
 * until complete), then emits WorkerStreamEvents to the main thread.
 */
export async function streamChat(
  params: StreamChatMessage,
  emit: (event: WorkerStreamEvent) => void,
): Promise<void> {
  const { message, threadId, alias, model, agentId } = params;

  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, threadId, alias, model, agentId }),
  });

  if (!response.body) throw new Error('No response body');

  emit({ type: 'chat:stream:start', message, assistantName: params.agentName });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const raw = decoder.decode(value);
      const lines = raw.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const payload = line.replace(/^data: /, '');

        // TODO: Replace this with the ChatDataChunk interface
        let chunk: Record<string, any>;

        try {
          chunk = JSON.parse(payload);

          emit({ type: 'chat:stream:data', content: chunk });
        } catch (error) {
          console.error(error);

          // If we can't parse the line, emit it as a text delta (fallback for non-conformant streams)
          console.log('Failed to parse stream line as JSON, emitting as text delta:', payload);
          continue;
        }
      }
    }

    emit({ type: 'chat:stream:done' });
  } catch (error) {
    emit({ type: 'chat:stream:error', error: error instanceof Error ? error.message : String(error) });
  }
}

export const GET_THREAD_EVT = 'get:thread' as const;
type GET_THREAD_EVT_TYPE = typeof GET_THREAD_EVT;

export const REFRESH_THREADS_EVT = 'refresh:threads' as const;
type REFRESH_THREADS_EVT_TYPE = typeof REFRESH_THREADS_EVT;

export interface GetThreadMetadata {
  type: GET_THREAD_EVT_TYPE;
  threadId: string;
};

export type GetThreadResponse = inferResponseEvents<GET_THREAD_EVT_TYPE, ThreadResponse>;

export interface RefreshThreadsMessage {
  type: REFRESH_THREADS_EVT_TYPE;
}

export type RefreshThreadsResponse = inferResponseEvents<REFRESH_THREADS_EVT_TYPE, ThreadsResponse>;

export async function refreshThreads(
  emit: (msg: RefreshThreadsResponse) => void,
): Promise<void> {
  try {
    const cached = await cacheGet<ThreadsResponse>('threads', 'list');
    if (cached) {
      emit({ type: 'refresh:threads:response', data: cached });
    }
  } catch { /* cache miss is fine */ }

  try {
    const data = await listThreads();
    await cachePut('threads', 'list', data);
    emit({ type: 'refresh:threads:response', data });
  } catch (error) {
    emit({
      type: 'refresh:threads:error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * @see /backend/src/controllers/v1/chat.ts#L153 for the source of truth on this endpoint's behavior.
 */
export async function getThread(
  threadId: string,
  emit: (msg: GetThreadResponse) => void,
): Promise<void> {
  try {
    const cached = await cacheGet<ThreadResponse>('thread-data', threadId);
    if (cached) {
      emit({ type: 'get:thread:response', data: cached });
    }
  } catch { /* cache miss is fine */ }

  try {
    const data = await getThreadHistory(threadId);
    await cachePut('thread-data', threadId, data);
    emit({ type: 'get:thread:response', data });
  } catch (error) {
    emit({
      type: 'get:thread:error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Resume stream (reconnect after navigation)
// ---------------------------------------------------------------------------

export const RESUME_STREAM_EVT = 'chat:stream:resume:check' as const;

export interface ResumeStreamMessage {
  type: typeof RESUME_STREAM_EVT;
  threadId: string;
}