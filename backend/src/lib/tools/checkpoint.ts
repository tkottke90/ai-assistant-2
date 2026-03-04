import { checkpointer } from '../database.js';
import { BaseMessage } from 'langchain';

/**
 * Finds the checkpoint ID of the most recent user turn in a thread.
 * Iterates checkpoints newest-first (LangGraph default order), returning the
 * first checkpoint that contains a HumanMessage.
 *
 * Fallback: if no HumanMessage exists yet (e.g. an agent auto-started before
 * the first user input), returns the thread_id as a coarse boundary. This
 * keeps the denial-scope contract `(thread_id, agent_id, tool_id, user_turn_checkpoint_id)`
 * semantically correct.
 */
export async function getUserTurnCheckpointId(threadId: string): Promise<string> {
  const historyGen = checkpointer.list({ configurable: { thread_id: threadId } });

  for await (const item of historyGen) {
    const messages = item.checkpoint.channel_values?.['messages'] as BaseMessage[] | undefined;
    if (messages?.some(m => m._getType() === 'human')) {
      return item.checkpoint.id;
    }
  }

  // No HumanMessage found — fall back to thread_id for scoping semantics
  return threadId;
}
