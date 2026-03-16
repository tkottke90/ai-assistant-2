import { useSignal } from '@preact/signals';
import { useCallback, useEffect } from 'preact/hooks';
import {
  getEvaluation,
  getEvaluationTools,
  updateEvaluation,
  runEvaluation,
  listEvaluationResults,
  completeEvaluationResult,
  scoreTestCase,
  saveReflection as saveReflectionClient,
  generateNextPrompt,
  type Evaluation,
  type EvaluationResult,
  type TestCase,
  type LlmEvalConfig,
} from '@tkottke90/ai-assistant-client';
import { fireWorkerEvent, useWorkerEventListener } from '@/lib/workerClient';
import { TRACK_EVAL, EVAL_RESULT_UPDATE } from '@/lib/eval-worker';

export interface EvaluationFormState {
  name: string;
  description: string;
  prompt: string;
  llmConfig: LlmEvalConfig;
  testCases: TestCase[];
  selectedTools: { tool_id: number; tier: 1 | 2 | 3 }[];
}

const DEFAULT_LLM_CONFIG: LlmEvalConfig = {
  alias: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  topK: 40,
};

/**
 * Maps an Evaluation API response + tool list to form state. Pure — testable independently.
 */
export function initFromEvaluation(
  evaluation: Evaluation,
  tools: { tool_id: number; tier: number }[],
): EvaluationFormState {
  return {
    name: evaluation.name,
    description: evaluation.description,
    prompt: evaluation.prompt,
    llmConfig: {
      ...DEFAULT_LLM_CONFIG,
      ...(evaluation.llm_config as LlmEvalConfig),
    },
    testCases: (evaluation.test_cases as TestCase[]) ?? [],
    selectedTools: tools.map((t) => ({
      tool_id: t.tool_id,
      tier: (t.tier ?? 1) as 1 | 2 | 3,
    })),
  };
}

/**
 * Pure updater — merges a partial patch into the current form state. Testable independently.
 */
export function updateEvalForm(
  current: EvaluationFormState,
  patch: Partial<EvaluationFormState>,
): EvaluationFormState {
  return { ...current, ...patch };
}

export function useEvaluation(evaluationId: number) {
  const evalForm = useSignal<EvaluationFormState>({
    name: '',
    description: '',
    prompt: '',
    llmConfig: { ...DEFAULT_LLM_CONFIG },
    testCases: [],
    selectedTools: [],
  });

  /**
   * The result currently being tracked by the system
   */
  const activeResult = useSignal<EvaluationResult | null>(null);

  /**
   * Allows for the selection of a result for further analysis
   */
  const selectedResult = useSignal<EvaluationResult | null>(null);
  const results = useSignal<EvaluationResult[]>([]);
  const loading = useSignal(true);
  const saving = useSignal(false);
  const executing = useSignal(false);

  // Subscribe to worker eval:result:update pushes
  useWorkerEventListener(EVAL_RESULT_UPDATE, (e) => {
    if (e.detail.evaluationId !== evaluationId) return;
    const data = e.detail.data;
    if (!data) return;

    // Update results list (upsert)
    const current = results.value;
    const idx = current.findIndex((r) => r.evaluation_result_id === data.evaluation_result_id);
    if (idx >= 0) {
      const updated = [...current];
      updated[idx] = data;
      results.value = updated;
    } else {
      results.value = [data, ...current];
    }

    // If this is the active result, keep it in sync
    if (activeResult.value?.evaluation_result_id === data.evaluation_result_id) {
      activeResult.value = data;
    }
    if (selectedResult.value?.evaluation_result_id === data.evaluation_result_id) {
      selectedResult.value = data;
    }
  });

  // On mount: load evaluation data + fire TRACK_EVAL
  useEffect(() => {
    loading.value = true;
    Promise.all([
      getEvaluation({ id: evaluationId }),
      getEvaluationTools({ id: evaluationId }),
      listEvaluationResults({ id: evaluationId }),
    ]).then(([evaluation, tools, evalResults]) => {
      evalForm.value = initFromEvaluation(evaluation, tools);
      results.value = evalResults;
      if (evalResults.length > 0) {
        activeResult.value = evalResults[0];
        // Only start polling if there is already an active running result
        if (evalResults[0].status === 'Running') {
          fireWorkerEvent({ type: TRACK_EVAL, evaluationId });
        }
      }
    }).catch((err) => {
      console.error('Failed to load evaluation:', err);
    }).finally(() => {
      loading.value = false;
    });
  }, [evaluationId]);

  const save = useCallback(async () => {
    saving.value = true;
    try {
      const form = evalForm.value;
      await updateEvaluation({
        id: evaluationId,
        name: form.name,
        description: form.description,
        prompt: form.prompt,
        llm_config: form.llmConfig,
        test_cases: form.testCases,
        tools: form.selectedTools,
      });
    } catch (err) {
      console.error('Failed to save evaluation:', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }, [evaluationId]);

  const execute = useCallback(async () => {
    executing.value = true;
    try {
      await runEvaluation({ id: evaluationId });
      fireWorkerEvent({ type: TRACK_EVAL, evaluationId });
    } catch (err) {
      console.error('Failed to execute evaluation:', err);
      throw err;
    } finally {
      executing.value = false;
    }
  }, [evaluationId]);

  const complete = useCallback(async () => {
    const result = activeResult.value;
    if (!result) return;
    try {
      const updated = await completeEvaluationResult({
        id: evaluationId,
        resultId: result.evaluation_result_id,
        status: 'Completed',
      });
      activeResult.value = updated;
      if (selectedResult.value?.evaluation_result_id === updated.evaluation_result_id) {
        selectedResult.value = updated;
      }
      const current = results.value;
      const idx = current.findIndex((r) => r.evaluation_result_id === updated.evaluation_result_id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = updated;
        results.value = next;
      }
    } catch (err) {
      console.error('Failed to complete evaluation result:', err);
      throw err;
    }
  }, [evaluationId]);

  const scoreCase = useCallback(async (
    resultId: number,
    caseId: string,
    score: { status: 'Pass' | 'Fail'; note?: string },
  ) => {
    const updated = await scoreTestCase({
      id: evaluationId,
      resultId,
      caseId,
      ...score,
    });
    if (activeResult.value?.evaluation_result_id === resultId) {
      activeResult.value = updated;
    }
    if (selectedResult.value?.evaluation_result_id === resultId) {
      selectedResult.value = updated;
    }
    const current = results.value;
    const idx = current.findIndex((r) => r.evaluation_result_id === resultId);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = updated;
      results.value = next;
    }
  }, [evaluationId]);

  const saveReflection = useCallback(async (
    resultId: number,
    notes: string,
    nextPrompt?: string,
  ) => {
    const updated = await saveReflectionClient({
      id: evaluationId,
      resultId,
      notes,
      nextPrompt,
    });
    if (activeResult.value?.evaluation_result_id === resultId) {
      activeResult.value = updated;
    }
    if (selectedResult.value?.evaluation_result_id === resultId) {
      selectedResult.value = updated;
    }
    const current = results.value;
    const idx = current.findIndex((r) => r.evaluation_result_id === resultId);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = updated;
      results.value = next;
    }
  }, [evaluationId]);

  const applyNextPrompt = useCallback(async (prompt: string) => {
    evalForm.value = { ...evalForm.value, prompt };
    await save();
  }, [save]);

  const generatePromptForResult = useCallback(async (
    resultId: number,
    alias: string,
    model: string,
  ): Promise<EvaluationResult> => {
    const updated = await generateNextPrompt({
      id: evaluationId,
      resultId,
      alias,
      model,
    });
    if (activeResult.value?.evaluation_result_id === resultId) {
      activeResult.value = updated;
    }
    if (selectedResult.value?.evaluation_result_id === resultId) {
      selectedResult.value = updated;
    }
    const current = results.value;
    const idx = current.findIndex((r) => r.evaluation_result_id === resultId);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = updated;
      results.value = next;
    }
    return updated;
  }, [evaluationId]);

  return {
    evalForm,
    updateEvalForm: (patch: Partial<EvaluationFormState>) => {
      evalForm.value = updateEvalForm(evalForm.value, patch);
    },
    activeResult,
    setActiveResult: (result: EvaluationResult) => { activeResult.value = result; },
    selectedResult,
    setSelectedResult: (result: EvaluationResult | null) => { selectedResult.value = result; },
    results,
    loading,
    saving,
    executing,
    save,
    execute,
    complete,
    scoreCase,
    saveReflection,
    generatePromptForResult,
    applyNextPrompt,
  };
}
