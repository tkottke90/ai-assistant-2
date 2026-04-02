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

function getMessageUsage(message: BaseMessage) {
  let usage = {
    prompt: 0,
    completion: 0,
    total: 0,
  };

  const metadata = message.response_metadata as Record<string, any> | undefined;

  if (!metadata) return usage;

  if (!metadata.eval_count) return usage;

  usage = {
    prompt: metadata?.prompt_eval_count ?? 0,
    completion: metadata?.eval_count ?? 0,
    total: (metadata?.prompt_eval_count ?? 0) + (metadata?.eval_count ?? 0),
  };

  return usage;
}

function getGenerationDetails(message: BaseMessage) {
  const metadata = message.response_metadata as Record<string, any> | undefined;

  if (!metadata) return {};

  if (!metadata.eval_duration || !metadata.eval_count) return {};

  const tokens = metadata.eval_count ?? 0;
  const duration = (metadata.eval_duration ?? 0) / 1e9; // Convert nanoseconds to seconds
  const totalDuration = (metadata.total_duration ?? 0) / 1e9; // Use total_duration if available, otherwise fallback to eval_duration

  const tokensPerSecond = duration > 0 ? tokens / duration : 0;

  return {
    model: metadata.model,
    tokens,
    generation_time_sec: Math.round(duration),
    total_time_sec: Math.round(totalDuration),
    tokens_per_second: Math.round(tokensPerSecond),
  }
}

export default {
  getMessageUsage,
  generateThreadId,
  getGenerationDetails,
  getThread,
  getMessagesFromThread
}