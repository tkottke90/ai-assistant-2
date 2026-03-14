import { z } from 'zod';

export const TestCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  expected_output: z.string(),
  type: z.enum(['text', 'tool']),
});

export const LlmEvalConfigSchema = z.object({
  alias: z.string().min(1, 'LLM alias is required'),
  model: z.string().min(1, 'LLM model is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
});

export const EvaluationProperties = z.object({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  llm_config: LlmEvalConfigSchema,
  test_cases: z.array(TestCaseSchema),
});

export const EvaluationSchema = EvaluationProperties.extend({
  evaluation_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const EvaluationToolSchema = z.object({
  evaluation_tool_id: z.number(),
  evaluation_id: z.number(),
  tool_id: z.number(),
  tool_name: z.string(),
  tier: z.number().int().min(1).max(3),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const TestCaseResultSchema = z.object({
  test_case_id: z.string(),
  input: z.string(),
  expected_output: z.string(),
  type: z.enum(['text', 'tool']),
  actual_output: z.string().nullable(),
  status: z.enum(['Pending', 'Pass', 'Fail']),
  note: z.string().optional(),
});

export const EvaluationResultToolSchema = z.object({
  tool_id: z.number(),
  name: z.string(),
});

export const EvaluationResultSchema = z.object({
  evaluation_result_id: z.number(),
  evaluation_id: z.number(),
  status: z.enum(['Running', 'Completed', 'Failed']),
  prompt: z.string(),
  llm_config: LlmEvalConfigSchema,
  tools: z.array(EvaluationResultToolSchema),
  results: z.array(TestCaseResultSchema),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
});

export const EvaluationListItemSchema = EvaluationSchema.extend({
  last_run_status: z.string().nullable(),
});

export const UpdateEvaluationResultSchema = z.object({
  status: z.enum(['Completed']),
});

export const ScoreTestCaseSchema = z.object({
  status: z.enum(['Pass', 'Fail']),
  note: z.string().optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;
export type LlmEvalConfig = z.infer<typeof LlmEvalConfigSchema>;
export type EvaluationPropertiesType = z.infer<typeof EvaluationProperties>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type EvaluationTool = z.infer<typeof EvaluationToolSchema>;
export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type EvaluationListItem = z.infer<typeof EvaluationListItemSchema>;
