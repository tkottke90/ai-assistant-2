import { createClientMethod } from '../client';
import { z } from 'zod';
import {
  EvaluationSchema,
  EvaluationProperties,
  EvaluationResultSchema,
  EvaluationToolSchema,
  UpdateEvaluationResultSchema,
  ScoreTestCaseSchema,
} from '../../models/evaluation.js';

const EvaluationListItemSchema = EvaluationSchema.extend({
  last_run_status: z.string().nullable(),
});

// ─── Evaluations ─────────────────────────────────────────────────────────────

export const listEvaluations = createClientMethod('/api/v1/evaluations', { method: 'get' }, async (response) => {
  if (!response.ok) throw new Error(`Failed to list evaluations: ${response.statusText}`);
  return z.array(EvaluationListItemSchema).parse(await response.json());
});

export const createEvaluation = createClientMethod('/api/v1/evaluations', { method: 'post', inputSchema: EvaluationProperties }, async (response) => {
  if (!response.ok) throw new Error(`Failed to create evaluation: ${response.statusText}`);
  return EvaluationSchema.parse(await response.json());
});

export const getEvaluation = createClientMethod('/api/v1/evaluations/:id', { method: 'get', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to get evaluation: ${response.statusText}`);
  return EvaluationSchema.parse(await response.json());
});

const UpdateEvaluationInput = EvaluationProperties.partial().extend({
  id: z.number(),
  tools: z.array(z.object({ tool_id: z.number(), tier: z.number() })).optional(),
});

export const updateEvaluation = createClientMethod('/api/v1/evaluations/:id', { method: 'put', inputSchema: UpdateEvaluationInput }, async (response) => {
  if (!response.ok) throw new Error(`Failed to update evaluation: ${response.statusText}`);
  return EvaluationSchema.parse(await response.json());
});

export const deleteEvaluation = createClientMethod('/api/v1/evaluations/:id', { method: 'delete', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to delete evaluation: ${response.statusText}`);
  return response;
});

// ─── Evaluation Tools ─────────────────────────────────────────────────────────

export const getEvaluationTools = createClientMethod('/api/v1/evaluations/:id/tools', { method: 'get', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to get evaluation tools: ${response.statusText}`);
  return z.array(EvaluationToolSchema).parse(await response.json());
});

// ─── Evaluation Runner ────────────────────────────────────────────────────────

export const runEvaluation = createClientMethod('/api/v1/evaluations/:id/run', { method: 'post', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to run evaluation: ${response.statusText}`);
  return EvaluationResultSchema.parse(await response.json());
});

// ─── Evaluation Results ───────────────────────────────────────────────────────

export const listEvaluationResults = createClientMethod('/api/v1/evaluations/:id/results', { method: 'get', inputSchema: z.object({ id: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to list evaluation results: ${response.statusText}`);
  return z.array(EvaluationResultSchema).parse(await response.json());
});

export const getEvaluationResult = createClientMethod('/api/v1/evaluations/:id/results/:resultId', { method: 'get', inputSchema: z.object({ id: z.number(), resultId: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to get evaluation result: ${response.statusText}`);
  return EvaluationResultSchema.parse(await response.json());
});

export const completeEvaluationResult = createClientMethod('/api/v1/evaluations/:id/results/:resultId', { method: 'patch', inputSchema: UpdateEvaluationResultSchema.extend({ id: z.number(), resultId: z.number() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to update evaluation result: ${response.statusText}`);
  return EvaluationResultSchema.parse(await response.json());
});

export const scoreTestCase = createClientMethod('/api/v1/evaluations/:id/results/:resultId/cases/:caseId', { method: 'patch', inputSchema: ScoreTestCaseSchema.extend({ id: z.number(), resultId: z.number(), caseId: z.string() }) }, async (response) => {
  if (!response.ok) throw new Error(`Failed to score test case: ${response.statusText}`);
  return EvaluationResultSchema.parse(await response.json());
});

// ─── Re-exported types ────────────────────────────────────────────────────────

export type { Evaluation, EvaluationResult, EvaluationTool, TestCase, TestCaseResult, LlmEvalConfig } from '../../models/evaluation.js';
