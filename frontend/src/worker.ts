import type { WorkerMessage } from './lib/messages';
import { createListAgentActionsMessage, REFRESH_AGENTS_EVT, refreshActiveAgents } from './lib/agents';
import { GET_THREAD_EVT, REFRESH_THREADS_EVT, STREAM_CHAT_EVT, RESUME_STREAM_EVT, getThread, refreshThreads, streamChat } from './lib/chat';
import { TRACK_EVAL, EVAL_RESULT_UPDATE, fetchLatestResult, type EvalResultUpdateResponse } from './lib/eval-worker';
import type { WorkerStreamEvent } from './lib/chat';
import { cachePut } from './lib/cache';
import { getThreadHistory } from '@tkottke90/ai-assistant-client';

function emit(message: WorkerMessage) {
  self.postMessage(message);
}

// ─── Stream snapshot state ────────────────────────────────────────────────────

interface StreamSnapshot {
  threadId: string;
  assistantId: string;
  agentName?: string;
  events: WorkerStreamEvent[];
}

const activeStreams = new Map<string, StreamSnapshot>();

// ─── Eval polling state ───────────────────────────────────────────────────────

const evalCache = new Map<number, EvalResultUpdateResponse['data']>();
const evalIntervals = new Map<number, ReturnType<typeof setInterval>>();

async function startEvalTracking(evaluationId: number): Promise<void> {
  if (evalIntervals.has(evaluationId)) return;

  // Fetch current state first — only start the interval if Running
  const initial = await fetchLatestResult(evaluationId);
  evalCache.set(evaluationId, initial.data);
  emit(initial);

  if (initial.data?.status !== 'Running') return;

  const interval = setInterval(async () => {
    const message = await fetchLatestResult(evaluationId);
    evalCache.set(evaluationId, message.data);
    emit(message);

    const status = message.data?.status;
    if (status === 'Completed' || status === 'Failed') {
      clearInterval(evalIntervals.get(evaluationId));
      evalIntervals.delete(evaluationId);
    }
  }, 2000);
  evalIntervals.set(evaluationId, interval);
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'ping': {
      emit({ type: 'ping:response', data: null });
      break;
    }

    case GET_THREAD_EVT: {
      getThread(e.data.threadId, emit);
      break;
    }

    case REFRESH_THREADS_EVT: {
      refreshThreads(emit);
      break;
    }

    case REFRESH_AGENTS_EVT: {
      refreshActiveAgents(emit);
      break;
    }
    
    case 'list:agent-actions': {
      await createListAgentActionsMessage(e.data.agentId).then(emit);
      break;
    }

    case STREAM_CHAT_EVT: {
      const streamThreadId = e.data.threadId;
      const assistantId = e.data.assistantId ?? '';
      const snapshot: StreamSnapshot = {
        threadId: streamThreadId,
        assistantId,
        agentName: e.data.agentName,
        events: [],
      };
      activeStreams.set(streamThreadId, snapshot);

      streamChat(e.data, (event: WorkerStreamEvent) => {
        snapshot.events.push(event);
        emit(event);
      })
        .then(() => {
          activeStreams.delete(streamThreadId);
          getThreadHistory(streamThreadId)
            .then(data => cachePut('thread-data', streamThreadId, data))
            .catch(() => { /* cache warming is best-effort */ });
        })
        .catch((err) => {
          activeStreams.delete(streamThreadId);
          emit({ type: 'chat:stream:error', error: String(err) });
        });
      break;
    }

    case RESUME_STREAM_EVT: {
      const snapshot = activeStreams.get(e.data.threadId);
      if (snapshot) {
        emit({
          type: 'chat:stream:resume',
          threadId: snapshot.threadId,
          assistantId: snapshot.assistantId,
          agentName: snapshot.agentName,
          events: snapshot.events.slice(),
        });
      } else {
        emit({ type: 'chat:stream:resume:none', threadId: e.data.threadId });
      }
      break;
    }

    case TRACK_EVAL: {
      const { evaluationId } = e.data;
      // Emit cached state immediately if available
      if (evalCache.has(evaluationId)) {
        emit({ type: EVAL_RESULT_UPDATE, evaluationId, data: evalCache.get(evaluationId) ?? null });
      }
      startEvalTracking(evaluationId);
      break;
    }

    default:
      console.warn('Worker received unknown message type:', type);
      return;
  }
};