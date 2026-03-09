import {
  getThreadHistory,
  listThreads,
  type ThreadResponse,
  type ThreadsResponse,
} from '@tkottke90/ai-assistant-client';
import type { inferResponseEvents } from './worker-event.types';

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
}

/**
 * Internal discriminated union used by the worker to classify raw stream lines.
 * Never sent to the main thread — coalesced into WorkerStreamEvent instead.
 */
export type StreamChunk =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool_call_chunk'; id: string; name: string; args: string }
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

export type WorkerStreamEvent =
  | StreamTextDelta
  | StreamThinking
  | StreamToolCallStart
  | StreamToolCallComplete
  | StreamToolResult
  | StreamAgentName
  | StreamDone
  | StreamError;

/**
 * Classify a single raw stream line into a StreamChunk.
 * Pure function — no side effects.
 */
export function classifyLine(line: string): StreamChunk {
  if (line.startsWith('done: ')) return { kind: 'done' };
  if (!line.startsWith('data: ')) return { kind: 'skip' };

  try {
    const data = JSON.parse(line.slice(6));

    if (data.mode === 'messages') {
      const firstChunk = data.chunk?.[0];
      const kwargs = firstChunk?.kwargs;
      if (!kwargs) return { kind: 'skip' };

      // Skip ToolMessage chunks — they are handled via mode: updates
      const constructorId: string[] = firstChunk?.id ?? [];
      if (constructorId[constructorId.length - 1] === 'ToolMessage') return { kind: 'skip' };

      // Tool call chunk — args stream in as partial JSON fragments
      if (kwargs.tool_call_chunks?.length > 0) {
        const tc = kwargs.tool_call_chunks[0];
        return { kind: 'tool_call_chunk', id: tc.id ?? '', name: tc.name ?? '', args: tc.args ?? '' };
      }

      // Thinking — reasoning_content present, content empty
      if (!kwargs.content && kwargs.additional_kwargs?.reasoning_content) {
        return { kind: 'thinking', content: kwargs.additional_kwargs.reasoning_content };
      }

      // Text delta
      if (kwargs.content) {
        return { kind: 'text', content: kwargs.content };
      }

      return { kind: 'skip' };
    }

    if (data.mode === 'updates') {
      // Tool result from the tools node
      const toolMessages = data.chunk?.tools?.messages;
      if (toolMessages?.length > 0) {
        const k = toolMessages[0].kwargs ?? {};
        return {
          kind: 'tool_result',
          toolCallId: k.tool_call_id ?? '',
          content: k.content ?? '',
          name: k.name ?? '',
        };
      }

      // Agent name from the agent node
      const agentMessages = data.chunk?.agent?.messages;
      if (agentMessages?.length > 0) {
        const name = agentMessages[0].kwargs?.name;
        if (name) return { kind: 'agent_name', name };
      }

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

  // Buffer tool call args until we see the matching tool_result
  const toolCallAccumulators = new Map<string, { name: string; args: string }>();

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

          case 'tool_call_chunk': {
            const existing = toolCallAccumulators.get(chunk.id);
            if (existing) {
              existing.args += chunk.args;
            } else {
              toolCallAccumulators.set(chunk.id, { name: chunk.name, args: chunk.args });
              emit({ type: 'chat:stream:tool_call_start', id: chunk.id, name: chunk.name });
            }
            break;
          }

          case 'tool_result': {
            // Flush accumulated args for this call before emitting the result
            const acc = toolCallAccumulators.get(chunk.toolCallId);
            if (acc) {
              emit({ type: 'chat:stream:tool_call_complete', id: chunk.toolCallId, args: acc.args });
              toolCallAccumulators.delete(chunk.toolCallId);
            }
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
    // Flush any tool calls whose result never arrived (edge case)
    for (const [id, acc] of toolCallAccumulators) {
      emit({ type: 'chat:stream:tool_call_complete', id, args: acc.args });
    }
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

export async function refreshThreads(): Promise<RefreshThreadsResponse> {
  try {
    const data = await listThreads();
    return { type: 'refresh:threads:response', data };
  } catch (error) {
    return {
      type: 'refresh:threads:error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @see /backend/src/controllers/v1/chat.ts#L153 for the source of truth on this endpoint's behavior.
 */
export async function getThread(threadId: string): Promise<GetThreadResponse> {
  try {
    const data = await getThreadHistory(threadId);
    return { type: 'get:thread:response', data };
  } catch (error) {
    return {
      type: 'get:thread:error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}