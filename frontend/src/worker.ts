import type { WorkerMessage } from './lib/messages';
import { createListAgentActionsMessage } from './lib/agents';
import { GET_THREAD_EVT, REFRESH_THREADS_EVT, STREAM_CHAT_EVT, getThread, refreshThreads, streamChat } from './lib/chat';
import { TRACK_EVAL, EVAL_RESULT_UPDATE, fetchLatestResult, type EvalResultUpdateResponse } from './lib/eval-worker';
import type { WorkerStreamEvent } from './lib/chat';

function emit(message: WorkerMessage) {
  self.postMessage(message);
}

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
      getThread(e.data.threadId).then(emit);
      break;
    }

    case REFRESH_THREADS_EVT: {
      refreshThreads().then(emit);
      break;
    }
    
    case 'list:agent-actions': {
      await createListAgentActionsMessage(e.data.agentId).then(emit);
      break;
    }

    case STREAM_CHAT_EVT: {
      streamChat(e.data, (event: WorkerStreamEvent) => emit(event)).catch((err) => {
        emit({ type: 'chat:stream:error', error: String(err) });
      });
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