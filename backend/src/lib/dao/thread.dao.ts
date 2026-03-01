import crypto from 'node:crypto';
import { checkpointer } from '../database.js';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { BaseMessage } from 'langchain';

function generateThreadId(): string {
  return crypto.randomUUID();
}

function getThread(threadId: string) {
  return checkpointer.get({
    configurable: {
      thread_id: threadId
    }
  })
}

async function getMessagesFromThread(checkpointer: BaseCheckpointSaver, threadId: string | string[]) {

  const historyGen = await checkpointer.list({ configurable: { thread_id: threadId } });

  // The History is a generator function.  We should convert
  // it to an array before sending it to the client.
  // Checkpoints are newest-first; by overwriting `ts` on every occurrence
  // we end up with the oldest (creation-time) checkpoint timestamp for each message.
  const historyMap = new Map<string, { msg: BaseMessage; ts: string }>();

  for await (const item of historyGen) {
    const values = item.checkpoint.channel_values;
    const ts = item.checkpoint.ts;

    if (values['messages']) {
      for (const msg of values['messages'] as BaseMessage[]) {
        if (!historyMap.has(msg.id!)) {
          historyMap.set(msg.id!, { msg, ts });
        } else {
          // Overwrite with the older timestamp as we walk backwards in time
          historyMap.get(msg.id!)!.ts = ts;
        }
      }
    }
  }

  return Array.from(historyMap.values());
}

export default {
  generateThreadId,
  getThread,
  getMessagesFromThread
}