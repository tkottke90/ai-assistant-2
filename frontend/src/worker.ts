import type { WorkerMessage } from './lib/messages';
import { createListAgentActionsMessage } from './lib/agents';
import { GET_THREAD_EVT, REFRESH_THREADS_EVT, STREAM_CHAT_EVT, getThread, refreshThreads, streamChat } from './lib/chat';
import type { WorkerStreamEvent } from './lib/chat';

function emit(message: WorkerMessage) {
  self.postMessage(message);
}



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

    default:
      console.warn('Worker received unknown message type:', type);
      return;
  }
};