import { Collapsable } from "@/components/collapsable-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EvaluationFormState } from "@/hooks/use-evaluation";
import type { EvaluationResult, TestCase, TestCaseResult } from "@tkottke90/ai-assistant-client";
import { type ReadonlySignal, type Signal } from "@preact/signals";
import { Trash2, CheckCircle2, XCircle } from "lucide-preact";
import { Plus } from "lucide-react";
import { Fragment } from "preact/jsx-runtime";
import { EvaluationsList } from "./evaluations";

interface TestCasesProps {
  scoringInProgress: ReadonlySignal<boolean>;
  evalForm: Signal<EvaluationFormState>;
  updateEvalForm: (patch: Partial<EvaluationFormState>) => void;
  activeResult: Signal<EvaluationResult | null>;
  selectedResult: Signal<EvaluationResult | null>;
  results: Signal<EvaluationResult[]>;
  onSetActiveResult: (result: EvaluationResult) => void;
  onSelectedResult: (result: EvaluationResult | null) => void;
  onScoreCase: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
}

export function TestCases({
  scoringInProgress,
  evalForm,
  updateEvalForm,
  activeResult,
  selectedResult,
  results,
  onSelectedResult,
  onScoreCase,
}: TestCasesProps) {
  return (
    <Collapsable
      title="Tests"
      startedOpen={true}
      className="shrink-0"
    >
      <Tabs defaultValue="test-data" className="w-full h-full">
        <TabsList variant="line" className="
          *:text-neutral-800 dark:*:text-neutral-200 
          *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
          *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
        ">
          <TabsTrigger value="test-data">Test Data</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger disabled={!scoringInProgress.value} value="scoring">Scoring</TabsTrigger>
        </TabsList>
        <TabsContent value="test-data" className="h-full overflow-auto pb-8">
          <TestCaseList evalForm={evalForm} updateEvalForm={updateEvalForm} />
        </TabsContent>
        <TabsContent value="evaluations" className="h-full overflow-auto">
          <EvaluationsList selectedResult={selectedResult}  results={results} setSelectedResult={onSelectedResult} />
        </TabsContent>
        <TabsContent value="scoring" className="h-full overflow-auto pb-8">
          <Scoring activeResult={activeResult} onScoreCase={onScoreCase} />
        </TabsContent>
      </Tabs>
    </Collapsable>
  );
}

// ─── Test Data tab ────────────────────────────────────────────────────────────

function TestCaseList({
  evalForm,
  updateEvalForm,
}: {
  evalForm: Signal<EvaluationFormState>;
  updateEvalForm: (patch: Partial<EvaluationFormState>) => void;
}) {
  const addCase = () => {
    const newCase: TestCase = {
      id: crypto.randomUUID(),
      input: '',
      expected_output: '',
      type: 'text',
    };
    updateEvalForm({ testCases: [...evalForm.value.testCases, newCase] });
  };

  const removeCase = (id: string) => {
    updateEvalForm({ testCases: evalForm.value.testCases.filter((tc) => tc.id !== id) });
  };

  const updateCase = (id: string, patch: Partial<TestCase>) => {
    updateEvalForm({
      testCases: evalForm.value.testCases.map((tc) =>
        tc.id === id ? { ...tc, ...patch } : tc
      ),
    });
  };

  return (
    <Fragment>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={addCase}>
          <Plus size={14} />
          Add
        </Button>
      </div>
      <div className="overflow-auto flex flex-col gap-2">
        {evalForm.value.testCases.length === 0 && (
          <p className="text-center text-sm text-neutral-500 py-4">No test cases yet. Click Add to create one.</p>
        )}
        {evalForm.value.testCases.map((tc) => (
          <TestCaseRow
            key={tc.id}
            testCase={tc}
            onRemove={() => removeCase(tc.id)}
            onUpdate={(patch) => updateCase(tc.id, patch)}
          />
        ))}
      </div>
      <br />
    </Fragment>
  );
}

function TestCaseRow({
  testCase,
  onRemove,
  onUpdate,
}: {
  testCase: TestCase;
  onRemove: () => void;
  onUpdate: (patch: Partial<TestCase>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded">
      <div className="flex gap-2 *:rounded *:min-h-18">
        <textarea
          className="grow border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-sm"
          placeholder="Input"
          defaultValue={testCase.input}
          onBlur={(e) => onUpdate({ input: (e.target as HTMLTextAreaElement).value })}
        />
        <textarea
          className="grow border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-sm"
          placeholder="Expected Output"
          defaultValue={testCase.expected_output}
          onBlur={(e) => onUpdate({ expected_output: (e.target as HTMLTextAreaElement).value })}
        />
      </div>
      <div className="flex justify-between gap-2 w-full px-1">
        <select
          className="w-32 px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-transparent text-sm"
          defaultValue={testCase.type}
          onChange={(e) => onUpdate({ type: (e.target as HTMLSelectElement).value as TestCase['type'] })}
        >
          <option value="text">Text</option>
          <option value="tool">Tool</option>
        </select>
        <Button variant="iconDestructive" size="icon-sm" type="button" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Scoring tab ─────────────────────────────────────────────────────────────

function Scoring({
  activeResult,
  onScoreCase,
}: {
  activeResult: Signal<EvaluationResult | null>;
  onScoreCase: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
}) {
  const result = activeResult.value;

  if (!result) {
    return (
      <p className="text-center text-sm text-neutral-500 py-4">No active evaluation result to score.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {result.results.map((tcr: TestCaseResult) => (
        <ScoringRow
          key={tcr.test_case_id}
          resultId={result.evaluation_result_id}
          testCaseResult={tcr}
          onScore={onScoreCase}
        />
      ))}
    </div>
  );
}

function ScoringRow({
  resultId,
  testCaseResult,
  onScore,
}: {
  resultId: number;
  testCaseResult: TestCaseResult;
  onScore: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
}) {
  const noteRef = { current: testCaseResult.note ?? '' };

  const score = (status: 'Pass' | 'Fail') => {
    onScore(resultId, testCaseResult.test_case_id, { status, note: noteRef.current || undefined });
  };

  return (
    <div className="flex flex-col gap-2 p-3 border border-neutral-200 dark:border-neutral-700 rounded text-sm">
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 mb-1">Input</p>
          <p className="whitespace-pre-wrap break-words">{testCaseResult.input}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 mb-1">Expected</p>
          <p className="whitespace-pre-wrap break-words text-neutral-600 dark:text-neutral-300">{testCaseResult.expected_output}</p>
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 mb-1">Actual</p>
          <p className="whitespace-pre-wrap break-words text-neutral-600 dark:text-neutral-300">
            {testCaseResult.actual_output ?? <span className="italic text-neutral-400">pending</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <textarea
          className="grow border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-xs rounded min-h-10"
          placeholder="Note (optional)"
          defaultValue={testCaseResult.note ?? ''}
          onBlur={(e) => { noteRef.current = (e.target as HTMLTextAreaElement).value; }}
        />
        <div className="flex flex-col gap-1">
          <Button
            variant={testCaseResult.status === 'Pass' ? 'constructive' : 'ghost'}
            size="icon-sm"
            type="button"
            onClick={() => score('Pass')}
          >
            <CheckCircle2 size={16} />
          </Button>
          <Button
            variant={testCaseResult.status === 'Fail' ? 'destructive' : 'ghost'}
            size="icon-sm"
            type="button"
            onClick={() => score('Fail')}
          >
            <XCircle size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}