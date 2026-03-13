import { listEvaluationResults, type EvaluationResult } from '@tkottke90/ai-assistant-client';

export const TRACK_EVAL = 'track:eval' as const;
export const EVAL_RESULT_UPDATE = 'eval:result:update' as const;

export interface TrackEvalMessage {
  type: typeof TRACK_EVAL;
  evaluationId: number;
}

export interface EvalResultUpdateResponse {
  type: typeof EVAL_RESULT_UPDATE;
  evaluationId: number;
  data: EvaluationResult | null;
}

/**
 * Fetches the latest EvaluationResult for an evaluation and returns it as an
 * EvalResultUpdateResponse. Pure function — no side effects.
 */
export async function fetchLatestResult(evaluationId: number): Promise<EvalResultUpdateResponse> {
  try {
    const results = await listEvaluationResults({ id: evaluationId });
    const latest = results.length > 0 ? results[0] : null;
    return { type: EVAL_RESULT_UPDATE, evaluationId, data: latest };
  } catch {
    return { type: EVAL_RESULT_UPDATE, evaluationId, data: null };
  }
}
