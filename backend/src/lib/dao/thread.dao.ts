import crypto from 'node:crypto';
import { checkpointer } from '../database.js';

export function generateThreadId(): string {
  return crypto.randomUUID();
}

export function getThread(threadId: string) {
  return checkpointer.get({
    configurable: {
      thread_id: threadId
    }
  })
}
