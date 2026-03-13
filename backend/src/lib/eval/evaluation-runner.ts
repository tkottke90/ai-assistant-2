import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createAgent } from 'langchain';
import type { Logger } from 'winston';
import EvaluationDao from '../dao/evaluation.dao.js';
import type { LLMManager } from '../llm/index.js';
import type { LlmEvalConfig, TestCaseResult } from '../models/evaluation.js';
import type { ToolManager } from '../tools/manager.js';

/**
 * Builds a configured LLM from the evaluation's llm_config.
 * Applies temperature and other overrides via property assignment after creation.
 */
function buildLlm(llmConfig: LlmEvalConfig, llmManager: LLMManager) {
  const llm = llmManager.getClientWithModel(llmConfig.alias, llmConfig.model);

  if (llmConfig.temperature !== undefined) (llm as any).temperature = llmConfig.temperature;
  if (llmConfig.maxTokens !== undefined) (llm as any).maxTokens = llmConfig.maxTokens;
  if (llmConfig.topP !== undefined) (llm as any).top_p = llmConfig.topP;
  if (llmConfig.topK !== undefined) (llm as any).top_k = llmConfig.topK;

  return llm;
}

/**
 * Runs an evaluation asynchronously. Called without `await` from the controller.
 * Sets result status to "Failed" only on an unrecoverable error. Otherwise,
 * the result status stays "Running" until the user explicitly marks it "Completed".
 */
export async function runEvaluation(
  evaluationId: number,
  resultId: number,
  llmManager: LLMManager,
  toolManager: ToolManager,
  logger: Logger,
): Promise<void> {
  logger.info(`Starting evaluation run`, { evaluationId, resultId });

  try {
    const evaluation = await EvaluationDao.getEvaluation(evaluationId);
    if (!evaluation) {
      logger.error(`Evaluation not found`, { evaluationId, resultId });
      await EvaluationDao.updateEvaluationResult(resultId, { status: 'Failed' });
      return;
    }

    const llmConfig = evaluation.llm_config as unknown as LlmEvalConfig;
    const testCases = evaluation.test_cases as unknown as Array<{
      id: string;
      input: string;
      expected_output: string;
      type: 'text' | 'tool';
    }>;

    const llm = buildLlm(llmConfig, llmManager);

    // Resolve evaluation tools through the ToolManager active registry
    const evalTools = await EvaluationDao.getEvaluationTools(evaluationId);
    const resolvedTools = evalTools
      .map((et) => toolManager.getActiveTool(et.tool.id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

    // Build a fresh stateless agent (no checkpointer)
    const agent = createAgent({
      model: llm,
      tools: resolvedTools,
      systemPrompt: new SystemMessage(evaluation.prompt),
    });

    const updatedResults: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const threadId = `${evaluationId}:${testCase.id}:${Date.now()}`;

      try {
        const response = await agent.invoke(
          { messages: [new HumanMessage(testCase.input)] },
          { configurable: { thread_id: threadId } },
        );

        const messages = response.messages ?? [];
        const lastAi = [...messages].reverse().find((m: any) => m._getType?.() === 'ai' || m.type === 'ai');
        const actualOutput = typeof lastAi?.content === 'string'
          ? lastAi.content
          : JSON.stringify(lastAi?.content ?? '');

        updatedResults.push({
          test_case_id: testCase.id,
          input: testCase.input,
          expected_output: testCase.expected_output,
          type: testCase.type,
          actual_output: actualOutput,
          status: 'Pending',
        });
      } catch (testErr: any) {
        logger.warn(`Test case failed`, { evaluationId, resultId, testCaseId: testCase.id, error: testErr?.message });
        updatedResults.push({
          test_case_id: testCase.id,
          input: testCase.input,
          expected_output: testCase.expected_output,
          type: testCase.type,
          actual_output: null,
          status: 'Pending',
          note: `Execution error: ${testErr?.message ?? 'unknown error'}`,
        });
      }

      // Persist progress after each test case
      await EvaluationDao.updateEvaluationResult(resultId, { results: updatedResults });
    }

    logger.info(`Evaluation run complete — awaiting user scoring`, { evaluationId, resultId });
    // Status stays "Running" — completion is an explicit user action
  } catch (err: any) {
    logger.error(`Evaluation run failed`, { evaluationId, resultId, error: err?.message ?? err });
    await EvaluationDao.updateEvaluationResult(resultId, { status: 'Failed' });
  }
}
