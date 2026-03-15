import { prisma } from '../database.js';
import type { EvaluationPropertiesType, TestCaseResult } from '../models/evaluation.js';

// ─── Evaluation CRUD ──────────────────────────────────────────────────────────

function createEvaluation(data: EvaluationPropertiesType) {
  return prisma.evaluation.create({
    data: {
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      llm_config: data.llm_config as any,
      test_cases: data.test_cases as any,
    },
  });
}

function getEvaluation(evaluationId: number) {
  return prisma.evaluation.findUnique({
    where: { evaluation_id: evaluationId },
  });
}

async function listEvaluations() {
  const evaluations = await prisma.evaluation.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      results: {
        orderBy: { created_at: 'desc' as const },
        take: 1,
      },
    },
  });

  return evaluations.map((e) => ({
    ...e,
    last_run_status: e.results[0]?.status ?? null,
    results: undefined,
  }));
}

function updateEvaluation(evaluationId: number, data: Partial<EvaluationPropertiesType>) {
  return prisma.evaluation.update({
    where: { evaluation_id: evaluationId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      ...(data.llm_config !== undefined ? { llm_config: data.llm_config as any } : {}),
      ...(data.test_cases !== undefined ? { test_cases: data.test_cases as any } : {}),
    },
  });
}

function deleteEvaluation(evaluationId: number) {
  return prisma.evaluation.delete({
    where: { evaluation_id: evaluationId },
  });
}

// ─── Evaluation Tools ─────────────────────────────────────────────────────────

function getEvaluationTools(evaluationId: number) {
  return prisma.evaluationTool.findMany({
    where: { evaluation_id: evaluationId },
    include: { tool: true },
    orderBy: { created_at: 'asc' },
  });
}

async function replaceEvaluationTools(
  evaluationId: number,
  tools: { tool_id: number; tier: number }[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.evaluationTool.deleteMany({ where: { evaluation_id: evaluationId } });

    if (tools.length === 0) return;

    const toolRecords = await tx.tool.findMany({
      where: { tool_id: { in: tools.map((t) => t.tool_id) } },
      select: { tool_id: true, name: true },
    });

    const nameMap = new Map(toolRecords.map((t) => [t.tool_id, t.name]));

    await tx.evaluationTool.createMany({
      data: tools.map((t) => ({
        evaluation_id: evaluationId,
        tool_id: t.tool_id,
        tool_name: nameMap.get(t.tool_id) ?? 'unknown',
        tier: t.tier,
      })),
    });
  });
}

// ─── Evaluation Results ───────────────────────────────────────────────────────

async function createEvaluationResult(
  evaluationId: number,
  initialResults: TestCaseResult[],
  snapshot: { prompt: string; llm_config: unknown; tools: { tool_id: number; name: string }[] },
) {
  return prisma.evaluationResults.create({
    data: {
      evaluation_id: evaluationId,
      status: 'Running',
      prompt: snapshot.prompt,
      llm_config: snapshot.llm_config as any,
      tools: snapshot.tools as any,
      results: initialResults as any,
    },
  });
}

function getEvaluationResult(resultId: number) {
  return prisma.evaluationResults.findUnique({
    where: { evaluation_result_id: resultId },
  });
}

function listEvaluationResults(evaluationId: number) {
  return prisma.evaluationResults.findMany({
    where: { evaluation_id: evaluationId },
    orderBy: { created_at: 'desc' },
  });
}

function updateEvaluationResult(
  resultId: number,
  data: { status?: string; results?: TestCaseResult[]; completed_at?: Date | null; notes?: string | null; nextPrompt?: string | null },
) {
  return prisma.evaluationResults.update({
    where: { evaluation_result_id: resultId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.results !== undefined ? { results: data.results as any } : {}),
      ...(data.completed_at !== undefined ? { completed_at: data.completed_at } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.nextPrompt !== undefined ? { nextPrompt: data.nextPrompt } : {}),
    },
  });
}

async function scoreTestCaseResult(
  resultId: number,
  testCaseId: string,
  score: { status: 'Pass' | 'Fail'; note?: string },
) {
  const result = await prisma.evaluationResults.findUnique({
    where: { evaluation_result_id: resultId },
  });

  if (!result) throw new Error('EvaluationResult not found');

  const results = result.results as unknown as TestCaseResult[];
  const updated = results.map((r) =>
    r.test_case_id === testCaseId
      ? { ...r, status: score.status, note: score.note ?? r.note }
      : r,
  );

  return prisma.evaluationResults.update({
    where: { evaluation_result_id: resultId },
    data: { results: updated as any },
  });
}

// ─── Checkpoint Cleanup ───────────────────────────────────────────────────────

async function deleteEvaluationResultThreads(evaluationId: number) {
  const prefix = `${evaluationId}:%`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM writes WHERE thread_id LIKE ${prefix}`;
    await tx.$executeRaw`DELETE FROM checkpoints WHERE thread_id LIKE ${prefix}`;
  });
}

export default {
  createEvaluation,
  getEvaluation,
  listEvaluations,
  updateEvaluation,
  deleteEvaluation,
  getEvaluationTools,
  replaceEvaluationTools,
  createEvaluationResult,
  getEvaluationResult,
  listEvaluationResults,
  updateEvaluationResult,
  scoreTestCaseResult,
  deleteEvaluationResultThreads,
};
