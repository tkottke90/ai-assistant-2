import {
  getThreadHistory,
  listThreads,
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
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool_call_start'; id: string; name: string }
  | { kind: 'tool_result'; toolCallId: string; content: string; name: string }
  | { kind: 'agent_name'; name: string }
  | { kind: 'done' }
  | { kind: 'skip' };

// Outbound events sent from the worker to the main thread
export type StreamTextDelta       = { type: 'chat:stream:text_delta';       content: string };
export type StreamThinking        = { type: 'chat:stream:thinking';         content: string };
export type StreamToolCallStart   = { type: 'chat:stream:tool_call_start';  id: string; name: string };
export type StreamToolCallComplete= { type: 'chat:stream:tool_call_complete'; id: string; args: string };
export type StreamToolResult      = { type: 'chat:stream:tool_result';      toolCallId: string; content: string; summary: string };
export type StreamAgentName       = { type: 'chat:stream:agent_name';       name: string };
export type StreamDone            = { type: 'chat:stream:done' };
export type StreamError           = { type: 'chat:stream:error';            error: string };

export type StreamResume          = {
  type: 'chat:stream:resume';
  threadId: string;
  assistantId: string;
  agentName?: string;
  events: WorkerStreamEvent[];
};
export type StreamResumeNone      = { type: 'chat:stream:resume:none';      threadId: string };

export type WorkerStreamEvent =
  | StreamTextDelta
  | StreamThinking
  | StreamToolCallStart
  | StreamToolCallComplete
  | StreamToolResult
  | StreamAgentName
  | StreamDone
  | StreamError;

export type WorkerStreamControlEvent =
  | StreamResume
  | StreamResumeNone;

/**
 * Classify a single raw stream line into a StreamChunk.
 * Pure function — no side effects.
 */
export function classifyLine(line: string): StreamChunk {
  if (line.startsWith('done: ')) return { kind: 'done' };
  if (!line.startsWith('data: ')) return { kind: 'skip' };

  try {
    const data = JSON.parse(line.slice(6));

    // Incremental text/thinking delta from the LLM
    if (data.mode === 'message') {
      const chunk = data.chunk;
      if (!chunk) return { kind: 'skip' };

      // Thinking — reasoning_content present in response_metadata
      if (chunk.response_metadata?.reasoning_content) {
        return { kind: 'thinking', content: chunk.response_metadata.reasoning_content };
      }

      // Text delta
      if (chunk.content) {
        return { kind: 'text', content: chunk.content };
      }

      return { kind: 'skip' };
    }

    // Agent is about to call a tool
    if (data.mode === 'tool_calling') {
      return { kind: 'tool_call_start', id: data.data?.id ?? '', name: data.data?.name ?? '' };
    }

    // Tool execution has completed; contains the full ServerAction result
    if (data.mode === 'tool_complete') {
      return {
        kind: 'tool_result',
        toolCallId: data.toolCallId ?? '',
        content: data.data?.content ?? '',
        name: data.data?.metadata?.tool_name ?? '',
      };
    }

    // Final AI response for this turn; may carry the agent name
    if (data.mode === 'final_response') {
      const name = data.data?.name;
      if (name) return { kind: 'agent_name', name };
      return { kind: 'skip' };
    }

    return { kind: 'skip' };
  } catch {
    return { kind: 'skip' };
  }
}

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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // Debounce thinking tokens — flush every 50ms or on phase change
  let thinkingBuffer = '';
  let thinkingFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushThinking = () => {
    if (thinkingFlushTimer) {
      clearTimeout(thinkingFlushTimer);
      thinkingFlushTimer = null;
    }
    if (thinkingBuffer) {
      emit({ type: 'chat:stream:thinking', content: thinkingBuffer });
      thinkingBuffer = '';
    }
  };

  let streamDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const raw = decoder.decode(value);
      const lines = raw.split('\n\n');

      for (const line of lines) {
        const chunk = classifyLine(line);

        switch (chunk.kind) {
          case 'done':
            streamDone = true;
            break;

          case 'text':
            flushThinking();
            emit({ type: 'chat:stream:text_delta', content: chunk.content });
            break;

          case 'thinking':
            thinkingBuffer += chunk.content;
            if (thinkingFlushTimer) clearTimeout(thinkingFlushTimer);
            thinkingFlushTimer = setTimeout(flushThinking, 50);
            break;

          case 'tool_call_start':
            emit({ type: 'chat:stream:tool_call_start', id: chunk.id, name: chunk.name });
            break;

          case 'tool_result': {
            // The backend emits tool calls atomically — emit complete (no args) then the result
            emit({ type: 'chat:stream:tool_call_complete', id: chunk.toolCallId, args: '' });
            emit({
              type: 'chat:stream:tool_result',
              toolCallId: chunk.toolCallId,
              content: chunk.content,
              summary: `${chunk.name}: ${chunk.content}`.slice(0, 120),
            });
            break;
          }

          case 'agent_name':
            emit({ type: 'chat:stream:agent_name', name: chunk.name });
            break;

          case 'skip':
          default:
            break;
        }

        if (streamDone) break;
      }

      if (streamDone) break;
    }
  } finally {
    // Flush any remaining thinking content
    flushThinking();
    emit({ type: 'chat:stream:done' });
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