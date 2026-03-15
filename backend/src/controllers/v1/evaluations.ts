import { Router } from 'express';
import { z } from 'zod';
import { formatDuration } from '@tkottke90/js-date-utils';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import EvaluationDao from '../../lib/dao/evaluation.dao.js';
import { EvaluationProperties, UpdateEvaluationResultSchema, SaveReflectionSchema, ScoreTestCaseSchema } from '../../lib/models/evaluation.js';
import { ZodBodyValidator, ZodIdValidator, ZodParamValidator } from '../../middleware/zod.middleware.js';
import { NotFoundError, BadRequestError } from '../../lib/errors/http.errors.js';
import { runEvaluation } from '../../lib/eval/evaluation-runner.js';

const GENERATE_PROMPT_SYSTEM = `You are an expert prompt engineer. You will be given an evaluation report for an AI system prompt. The report contains the original prompt, test inputs with expected vs actual outputs, pass/fail status for each case, and user reflection notes.

Your task is to generate an improved version of the prompt based on the evaluation findings. Analyze the failures and patterns carefully, then produce a single revised prompt that addresses the identified issues.

Return ONLY the new prompt text — no preamble, no explanation, no conversational text.`;

export const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getEvaluationOr404(id: number) {
  const evaluation = await EvaluationDao.getEvaluation(id);
  if (!evaluation) throw new NotFoundError('Evaluation not found');
  return evaluation;
}

async function getResultOr404(evaluationId: number, resultId: number) {
  const result = await EvaluationDao.getEvaluationResult(resultId);
  if (!result || result.evaluation_id !== evaluationId) throw new NotFoundError('EvaluationResult not found');
  return result;
}

// ─── Evaluations CRUD ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const evaluations = await EvaluationDao.listEvaluations();
  res.json(evaluations);
});

router.post('/',
  ZodBodyValidator(EvaluationProperties),
  async (req, res) => {
    const evaluation = await EvaluationDao.createEvaluation(req.body);
    res.status(201).json(evaluation);
  },
);

router.get('/:id',
  ZodIdValidator('id'),
  async (req, res) => {
    const evaluation = await getEvaluationOr404(Number(req.params.id));
    res.json(evaluation);
  },
);

const UpdateEvaluationBodySchema = EvaluationProperties.partial().extend({
  tools: z.array(z.object({ tool_id: z.number(), tier: z.number().min(1).max(3) })).optional(),
});

router.put('/:id',
  ZodIdValidator('id'),
  ZodBodyValidator(UpdateEvaluationBodySchema),
  async (req, res) => {
    const id = Number(req.params.id);
    await getEvaluationOr404(id);

    const { tools, ...evalData } = req.body;
    const updated = await EvaluationDao.updateEvaluation(id, evalData);

    if (tools !== undefined) {
      await EvaluationDao.replaceEvaluationTools(id, tools);
    }

    res.json(updated);
  },
);

router.delete('/:id',
  ZodIdValidator('id'),
  async (req, res) => {
    const id = Number(req.params.id);
    await getEvaluationOr404(id);
    await EvaluationDao.deleteEvaluationResultThreads(id);
    await EvaluationDao.deleteEvaluation(id);
    res.status(204).send();
  },
);

// ─── Evaluation Tools ─────────────────────────────────────────────────────────

router.get('/:id/tools',
  ZodIdValidator('id'),
  async (req, res) => {
    const id = Number(req.params.id);
    await getEvaluationOr404(id);
    const tools = await EvaluationDao.getEvaluationTools(id);
    res.json(tools);
  },
);

// ─── Evaluation Runner ────────────────────────────────────────────────────────

router.post('/:id/run',
  ZodIdValidator('id'),
  async (req, res) => {
    const id = Number(req.params.id);
    const evaluation = await getEvaluationOr404(id);

    const testCases = evaluation.test_cases as unknown as Array<{
      id: string;
      input: string;
      expected_output: string;
      type: 'text' | 'tool';
    }>;

    const initialResults = testCases.map((tc) => ({
      test_case_id: tc.id,
      input: tc.input,
      expected_output: tc.expected_output,
      type: tc.type,
      actual_output: null as null,
      status: 'Pending' as const,
    }));

    const evalTools = await EvaluationDao.getEvaluationTools(id);
    const toolsSnapshot = evalTools.map((et) => ({ tool_id: et.tool_id, name: et.tool_name }));

    const result = await EvaluationDao.createEvaluationResult(id, initialResults, {
      prompt: evaluation.prompt,
      llm_config: evaluation.llm_config,
      tools: toolsSnapshot,
    });

    // Fire and forget — HTTP response returns before execution begins
    runEvaluation(id, result.evaluation_result_id, req.app.llm, req.app.tools, req.logger).catch((err) => {
      req.logger.error('Unhandled evaluation runner error', { error: err?.message ?? err });
    });

    res.status(201).json(result);
  },
);

// ─── Evaluation Results ───────────────────────────────────────────────────────

router.get('/:id/results',
  ZodIdValidator('id'),
  async (req, res) => {
    const id = Number(req.params.id);
    await getEvaluationOr404(id);
    const results = await EvaluationDao.listEvaluationResults(id);
    res.json(results);
  },
);

const ResultParamSchema = z.object({
  id: z.coerce.number(),
  resultId: z.coerce.number(),
});

router.get('/:id/results/:resultId',
  ZodParamValidator(ResultParamSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    const result = await getResultOr404(id, resultId);
    res.json(result);
  },
);

router.patch('/:id/results/:resultId',
  ZodParamValidator(ResultParamSchema),
  ZodBodyValidator(UpdateEvaluationResultSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    const current = await getResultOr404(id, resultId);

    if (current.status === 'Failed') {
      throw new BadRequestError('Cannot update a failed evaluation result');
    }

    const updated = await EvaluationDao.updateEvaluationResult(resultId, {
      status: req.body.status,
      completed_at: req.body.status === 'Completed' ? new Date() : undefined,
    });

    res.json(updated);
  },
);

// ─── Export ──────────────────────────────────────────────────────────────────

type ExportEvaluation = { name: string; description: string };
type ExportResult = {
  prompt: string;
  llm_config: { alias: string; model: string };
  results: { input: string; expected_output: string; actual_output: string | null; status: string; note?: string }[];
  created_at: Date;
  completed_at: Date | null;
};

type ExportResultWithNotes = ExportResult & { notes?: string | null };

function buildExportMarkdown(evaluation: ExportEvaluation, result: ExportResultWithNotes): string {
  const passed = result.results.filter((r) => r.status === 'Pass').length;
  const total = result.results.length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const date = result.created_at.toISOString().split('T')[0];
  const duration = result.completed_at ? formatDuration(result.created_at, result.completed_at) : 'In progress';
  const reflection = result.notes ?? evaluation.description;

  const tableRows = result.results
    .map((r, i) => `| ${i + 1} | \`${r.input}\` | \`${r.expected_output}\` | \`${r.actual_output ?? 'N/A'}\` | ${r.status} | ${r.note ?? ''} |`)
    .join('\n');

  return `# Prompt Evaluation Report: ${evaluation.name}

Below are the details for a prompt evaluation we conducted. Data is collected in a structured XML format.

<date>${date}</date>
<duration>${duration}</duration>
<result>${passed}/${total} Passed (${pct}%)</result>
<llm>${result.llm_config.alias} / ${result.llm_config.model}</llm>

<prompt>
${result.prompt}
</prompt>

<test-output>
| Index | Input | Expected Output | Actual Output | Pass/Fail | Notes |
|---|---|---|---|---|---|
${tableRows}
</test-output>

<user-reflection>
${reflection}
</user-reflection>`;
}

router.get('/:id/results/:resultId/export',
  ZodParamValidator(ResultParamSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    const [evaluation, result] = await Promise.all([
      getEvaluationOr404(id),
      getResultOr404(id, resultId),
    ]);

    const markdown = buildExportMarkdown(evaluation as any, result as any);
    const filename = `eval-${id}-result-${resultId}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(markdown);
  },
);

router.patch('/:id/results/:resultId/reflection',
  ZodParamValidator(ResultParamSchema),
  ZodBodyValidator(SaveReflectionSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    await getResultOr404(id, resultId);

    const updated = await EvaluationDao.updateEvaluationResult(resultId, {
      notes: req.body.notes,
      nextPrompt: req.body.nextPrompt ?? null,
    });

    res.json(updated);
  },
);

const GeneratePromptBodySchema = z.object({
  alias: z.string().min(1),
  model: z.string().min(1),
});

router.post('/:id/results/:resultId/generate-prompt',
  ZodParamValidator(ResultParamSchema),
  ZodBodyValidator(GeneratePromptBodySchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    const [evaluation, result] = await Promise.all([
      getEvaluationOr404(id),
      getResultOr404(id, resultId),
    ]);

    const reportMarkdown = buildExportMarkdown(evaluation as any, result as any);
    const llm = req.app.llm.getClientWithModel(req.body.alias, req.body.model);
    const response = await llm.invoke([
      new SystemMessage(GENERATE_PROMPT_SYSTEM),
      new HumanMessage(reportMarkdown),
    ]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const updated = await EvaluationDao.updateEvaluationResult(resultId, {
      nextPrompt: content,
    });

    res.json(updated);
  },
);

const CaseParamSchema = z.object({
  id: z.coerce.number(),
  resultId: z.coerce.number(),
  caseId: z.string(),
});

router.patch('/:id/results/:resultId/cases/:caseId',
  ZodParamValidator(CaseParamSchema),
  ZodBodyValidator(ScoreTestCaseSchema),
  async (req, res) => {
    const id = Number(req.params.id);
    const resultId = Number(req.params.resultId);
    const caseId = String(req.params.caseId);

    await getResultOr404(id, resultId);

    const updated = await EvaluationDao.scoreTestCaseResult(resultId, caseId, req.body);
    res.json(updated);
  },
);

export default router;
