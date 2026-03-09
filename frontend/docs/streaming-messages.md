# Streaming Messages

When the user submits a chat message to an agent, the backend streams a chunked HTTP response instead of returning a single JSON payload. Each line is a JSON object prefixed with `data: ` or a terminal `done: [DONE]` sentinel.

This document describes how the frontend classifies, accumulates, and renders those events.

---

## Stream Chunk Taxonomy

The backend emits three modes of chunk:

### `mode: "messages"` — Token-level output from the LLM

The most frequent events. Each has a `chunk[0].kwargs` object:

| Condition | Classified as |
|---|---|
| `kwargs.content` is non-empty | `text` — a streamed response token |
| `kwargs.additional_kwargs.reasoning_content` is non-empty, `content` is empty | `thinking` — a reasoning/reflection token |
| `kwargs.tool_call_chunks` is non-empty | `tool_call_chunk` — a partial tool invocation |

### `mode: "updates"` — Node-level state updates from LangGraph

Emitted once per graph node transition:

| Condition | Classified as |
|---|---|
| `chunk.tools.messages[0]` exists | `tool_result` — the output of an executed tool |
| `chunk.agent.messages[0].kwargs.name` exists | `agent_name` — the name of the responding agent |

### `done: [DONE]` — Stream sentinel

Signals that the stream is complete.

---

## Stream → Worker Event Protocol

Raw stream lines are never sent to the main thread. The Web Worker owns the `fetch` call and the stream reader loop, classifies every line via `classifyLine()`, and emits coarse-grained `WorkerStreamEvent` messages to the main thread.

### Coalescing rules

**Thinking tokens** are buffered in the worker and flushed as a single `chat:stream:thinking` event every 50ms (or immediately when a non-thinking chunk arrives). This prevents the main thread from re-rendering on every individual reasoning token.

**Tool call args** are accumulated across multiple `tool_call_chunk` lines — they stream in as partial JSON. The worker only emits `chat:stream:tool_call_complete` once all args for a given tool call id have arrived (i.e. when the corresponding `tool_result` is seen, or at stream end).

---

## `WorkerStreamEvent` Types

All stream events are `OutboundMessage` variants dispatched via the worker emitter. Components subscribe via `useWorkerOutboundEvent`.

```typescript
// A streamed response token
{ type: 'chat:stream:text_delta'; content: string }

// Batched reasoning/thinking content (debounced, 50ms)
{ type: 'chat:stream:thinking'; content: string }

// First chunk seen for a new tool call — use to push a ServerAction stub into history
{ type: 'chat:stream:tool_call_start'; id: string; name: string }

// All args for a tool call have arrived
{ type: 'chat:stream:tool_call_complete'; id: string; args: string }

// Tool executed on the backend — update the matching ServerAction in history
{ type: 'chat:stream:tool_result'; toolCallId: string; content: string; summary: string }

// Agent name extracted from `mode: updates` — use to patch the avatar
{ type: 'chat:stream:agent_name'; name: string }

// Stream is finished — set isStreaming = false, trigger REFRESH_THREADS_EVT
{ type: 'chat:stream:done' }

// Fatal error during streaming
{ type: 'chat:stream:error'; error: string }
```

---

## Main Thread History Model

The flat `history: ChatMessage[]` array on the thread signal is the shared source of truth for both streaming and post-refresh display. The streaming layer maps worker events to mutations on this array:

| Worker Event | History Mutation |
|---|---|
| `text_delta` | Append `content` to the current assistant `InteractionMessage` |
| `thinking` | Append to `assistantMessage.metadata.thinking` |
| `tool_call_start` | Push a new `ServerAction` stub with `id = toolCallId` |
| `tool_call_complete` | Find `ServerAction` by `id`, set `metadata.tool_args` |
| `tool_result` | Find `ServerAction` by `id`, set `content` and `metadata.tool_summary` |
| `agent_name` | Find the streaming `InteractionMessage` by `id`, set `name` |
| `done` | `isStreaming.value = false` |

After `done`, `REFRESH_THREADS_EVT` is fired so the thread list sidebar refreshes. The GET thread endpoint also re-fetches full history, which overwrites the locally-built parts array — so the persisted shape and the streamed shape must always be equivalent.

---

## Data Flow

```
User submits form
  │
  ▼
ChatForm fires fireWorkerEvent({ type: 'chat:stream', ... })
  + creates optimistic userMessage + assistantMessage in history
  │
  ▼
worker.ts → streamChat(params, emit)
  │ owns fetch + stream reader loop
  │ classifyLine() per raw stream line
  │ accumulates thinking (debounced) + tool_call_chunks (buffered)
  │
  ├─ emit({ type: 'chat:stream:text_delta', ... })
  ├─ emit({ type: 'chat:stream:thinking', ... })        ← debounced
  ├─ emit({ type: 'chat:stream:tool_call_start', ... })
  ├─ emit({ type: 'chat:stream:tool_call_complete', ... })
  ├─ emit({ type: 'chat:stream:tool_result', ... })
  ├─ emit({ type: 'chat:stream:agent_name', ... })
  └─ emit({ type: 'chat:stream:done' })
       │
       ▼
worker.onmessage → emitter.dispatchEvent(new CustomEvent(type, { detail: msg }))
       │
       ▼
ChatForm useWorkerOutboundEvent handlers
  → mutate thread.value.history signal
  → isStreaming.value = false on done
```

---

## Files Involved

| File | Role |
|---|---|
| `src/lib/chat.ts` | `classifyLine`, `streamChat`, `WorkerStreamEvent` types, `STREAM_CHAT_EVT` |
| `src/worker.ts` | Dispatches `STREAM_CHAT_EVT` to `streamChat` |
| `src/lib/workerClient.ts` | `useWorkerOutboundEvent` — subscribe to outbound stream events |
| `src/routes/chat/chat-form.tsx` | Fires `chat:stream`, subscribes to all stream events, mutates history |
| `src/routes/chat/messages.tsx` | Renders `metadata.thinking` as a collapsible block |
