import {
  getThreadHistory,
  type ThreadResponse
} from '@tkottke90/ai-assistant-client';
import type { inferResponseEvents } from './worker-event.types';

export const GET_THREAD_EVT = 'get:thread' as const;
type GET_THREAD_EVT_TYPE = typeof GET_THREAD_EVT;

export interface GetThreadMetadata {
  type: GET_THREAD_EVT_TYPE;
  threadId: string;
};

export type GetThreadResponse = inferResponseEvents<GET_THREAD_EVT_TYPE, ThreadResponse>;

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