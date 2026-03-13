import { Router } from 'express';
import { z } from 'zod';
import EvaluationDao from '../../lib/dao/evaluation.dao.js';
import { EvaluationProperties, UpdateEvaluationResultSchema, ScoreTestCaseSchema } from '../../lib/models/evaluation.js';
import { ZodBodyValidator, ZodIdValidator, ZodParamValidator } from '../../middleware/zod.middleware.js';
import { NotFoundError, BadRequestError } from '../../lib/errors/http.errors.js';
import { runEvaluation } from '../../lib/eval/evaluation-runner.js';

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

    const result = await EvaluationDao.createEvaluationResult(id, initialResults);

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
