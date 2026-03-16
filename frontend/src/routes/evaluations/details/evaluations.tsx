import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatRelativeDate, formatDuration } from "@/lib/date-utils";
import { useComputed, useSignal, useSignalEffect, type Signal } from "@preact/signals";
import { useCallback } from "preact/hooks";
import type { EvaluationResult, TestCaseResult } from "@tkottke90/ai-assistant-client";
import { CheckCircle2, Copy, Download, MessageSquareCodeIcon, SendHorizonal, Sparkle, XCircle } from "lucide-preact";
import { LlmSelector } from "@/components/llm-selector";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { toast } from "sonner";


function statusBadgeClass(status: string): string {
  if (status === 'Completed') return 'text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (status === 'Running') return 'text-xs px-2 py-0.5 rounded font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  if (status === 'Failed') return 'text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  return 'text-xs px-2 py-0.5 rounded font-medium bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300';
}

export function EvaluationsList({
  selectedResult,
  results,
  setSelectedResult,
  onScoreCase,
  onComplete,
  onSaveReflection,
  onGeneratePrompt,
  onApplyNextPrompt,
  onExport,
  onOpenInChat,
}: {
  selectedResult: Signal<EvaluationResult | null>;
  results: Signal<EvaluationResult[]>;
  setSelectedResult: (result: EvaluationResult | null) => void;
  onScoreCase: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
  onComplete: () => Promise<void>;
  onSaveReflection: (resultId: number, notes: string, nextPrompt?: string) => Promise<void>;
  onGeneratePrompt: (resultId: number, alias: string, model: string) => Promise<EvaluationResult>;
  onApplyNextPrompt: (prompt: string) => Promise<void>;
  onExport: (resultId: number) => Promise<void>;
  onOpenInChat: (resultId: number) => Promise<void>;
}) {
  if (results.value.length === 0) {
    return (
      <p className="text-center text-sm text-neutral-500 py-4">No evaluation runs yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {results.value.map((r) => (
        <div
          key={r.evaluation_result_id}
          className="flex items-center justify-between px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
          onClick={() => setSelectedResult(r)}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">{formatRelativeDate(r.created_at)}</span>
            <span className="text-xs text-neutral-400">
              {r.results.filter((c: TestCaseResult) => c.status === 'Pass').length}/{r.results.length} passed
            </span>
          </div>
          <span className={statusBadgeClass(r.status)}>{r.status}</span>
        </div>
      ))}
      <EvaluationDrawer selected={selectedResult} setSelected={setSelectedResult} onScoreCase={onScoreCase} onComplete={onComplete} onSaveReflection={onSaveReflection} onGeneratePrompt={onGeneratePrompt} onApplyNextPrompt={onApplyNextPrompt} onExport={onExport} onOpenInChat={onOpenInChat} />
    </div>
  );
}


export function EvaluationDrawer({ selected, setSelected, onScoreCase, onComplete, onSaveReflection, onGeneratePrompt, onApplyNextPrompt, onExport, onOpenInChat }: {
  selected: Signal<EvaluationResult | null>;
  setSelected: (result: EvaluationResult | null) => void;
  onScoreCase: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
  onComplete: () => Promise<void>;
  onSaveReflection: (resultId: number, notes: string, nextPrompt?: string) => Promise<void>;
  onGeneratePrompt: (resultId: number, alias: string, model: string) => Promise<EvaluationResult>;
  onApplyNextPrompt: (prompt: string) => Promise<void>;
  onExport: (resultId: number) => Promise<void>;
  onOpenInChat: (resultId: number) => Promise<void>;
}) {
  const eventTrigger = useSignal(new EventTarget());
  const openingInChat = useSignal(false);

  const isReadonly = useComputed(() => {
    if (!selected.value) return true;
    return selected.value.status === 'Completed' || selected.value.status === 'Failed';
  });

  const completionStr = useComputed(() => {
    if (!selected.value) return '';
    
    const finishedCount = selected.value.results.filter(result => result.status != 'Pending').length;

    return `${finishedCount}/${selected.value.results.length}`;
  });

  useSignalEffect(() => {
    if (selected.value) {
      eventTrigger.value.dispatchEvent(new CustomEvent('open'));
    } else {
      eventTrigger.value.dispatchEvent(new CustomEvent('close'));
    }
  });

  const title = useComputed(() => {
    if (!selected.value) return 'Evaluation Result - Unknown';
    
    return (
      <>
        <span>Evaluation Results</span>&nbsp;
        <span className={statusBadgeClass(selected.value.status)}>{selected.value.status}</span>
      </>
    )
  });

  return (
    <Drawer
      direction="right"
      title={title.value}
      showTrigger={false}
      eventTrigger={eventTrigger}
      onClose={() => setSelected(null) }
      className="flex flex-col"
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <span className="font-medium text-neutral-500">Engine</span>
        <span>{selected.value?.llm_config.alias ?? '-'}</span>
        <span className="font-medium text-neutral-500">Model</span>
        <span>{selected.value?.llm_config.model ?? '-'}</span>
        <span className="font-medium text-neutral-500">Started</span>
        <span>{selected.value?.created_at.toLocaleString() ?? '-'}</span>
        <span className="font-medium text-neutral-500">Completed</span>
        <span>{selected.value?.completed_at?.toLocaleString() ?? '-'}</span>
        <span className="font-medium text-neutral-500">Duration</span>
        <span>{selected.value?.completed_at ? formatDuration(selected.value.created_at.getTime(), selected.value.completed_at.getTime()) : '-'}</span>
      </div>

      <div className="flex justify-end gap-2">
        <Button disabled={isReadonly.value} variant={isReadonly.value ? 'outline' : 'constructive'} onClick={onComplete}>Complete</Button>
        <Button
          disabled={!isReadonly.value}
          variant={isReadonly.value ? 'outline' : 'ghost'}
          title="Download Report"
          onClick={() => selected.value && onExport(selected.value.evaluation_result_id)}
        >
          <Download size={16} />
        </Button>
        <Button disabled={!isReadonly.value} variant={isReadonly.value ? 'outline' : 'constructive'} title="Copy Report to Clipboard" onClick={() => {}}>
          <Copy size={16} /> {/* Copy report to clipboard */}
        </Button>
        <Button
          disabled={!isReadonly.value || openingInChat.value}
          variant={isReadonly.value ? 'outline' : 'constructive'}
          title="Open Report in Chat"
          onClick={async () => {
            if (!selected.value || openingInChat.value) return;
            openingInChat.value = true;
            try {
              await onOpenInChat(selected.value.evaluation_result_id);
            } finally {
              openingInChat.value = false;
            }
          }}
        >
          <MessageSquareCodeIcon size={16} />
        </Button>
      </div>
      <hr className="my-4 opacity-60" />
      <Tabs defaultValue="scoring" className="w-full flex-1 min-h-0 flex flex-col">
        <TabsList variant="line" className="
          *:text-neutral-800 dark:*:text-neutral-200 
          *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
          *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
          ">
          <TabsTrigger value="scoring">Scoring&nbsp;({completionStr})</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="reflection">Reflection</TabsTrigger>
        </TabsList>
        <TabsContent value="scoring" className="min-h-0 overflow-auto pb-8">
          <Scoring activeResult={selected} onScoreCase={onScoreCase} />
        </TabsContent>
        <TabsContent value="prompt" className="min-h-0 overflow-auto pb-8">
          <pre><code>
            { selected.value?.prompt ?? 'N/A' }
          </code></pre>
        </TabsContent>
        <TabsContent value="reflection" className="min-h-0 overflow-y-auto pb-8 px-1">
          <Reflection selected={selected} onSaveReflection={onSaveReflection} onGeneratePrompt={onGeneratePrompt} onApplyNextPrompt={(p) => onApplyNextPrompt(p).then(() => setSelected(null))} />
        </TabsContent>
      </Tabs>
    </Drawer>
  )
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

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
      <p className="text-center text-sm text-neutral-500 py-4">No evaluation result selected.</p>
    );
  }

  const isReadOnly = result.status === 'Completed' || result.status === 'Failed';

  return (
    <>
      <div className="flex flex-col gap-3 py-2">
        {result.results.map((tcr: TestCaseResult) => (
          <ScoringRow
            key={tcr.test_case_id}
            resultId={result.evaluation_result_id}
            testCaseResult={tcr}
            onScore={onScoreCase}
            disabled={isReadOnly}
          />
        ))}
      </div>
    </>
  );
}

function ScoringRow({
  resultId,
  testCaseResult,
  onScore,
  disabled,
}: {
  resultId: number;
  testCaseResult: TestCaseResult;
  onScore: (resultId: number, caseId: string, score: { status: 'Pass' | 'Fail'; note?: string }) => Promise<void>;
  disabled?: boolean;
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
          <p className="whitespace-pre-wrap wrap-break-word">{testCaseResult.input}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 mb-1">Expected</p>
          <p className="whitespace-pre-wrap wrap-break-word text-neutral-600 dark:text-neutral-300">{testCaseResult.expected_output}</p>
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 mb-1">Actual</p>
          <p className="whitespace-pre-wrap wrap-break-word text-neutral-600 dark:text-neutral-300">
            {testCaseResult.actual_output ?? <span className="italic text-neutral-400">pending</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <textarea
          className="grow border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-xs rounded min-h-10 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Note (optional)"
          defaultValue={testCaseResult.note ?? ''}
          disabled={disabled}
          onBlur={(e) => { noteRef.current = (e.target as HTMLTextAreaElement).value; }}
        />
        <div className="flex flex-col gap-1">
          <Button
            variant={testCaseResult.status === 'Pass' ? 'constructive' : 'ghost'}
            size="icon-sm"
            type="button"
            disabled={disabled}
            onClick={() => score('Pass')}
            title="Mark as Passed"
          >
            <CheckCircle2 size={16} />
          </Button>
          <Button
            variant={testCaseResult.status === 'Fail' ? 'destructive' : 'ghost'}
            size="icon-sm"
            type="button"
            disabled={disabled}
            onClick={() => score('Fail')}
            title="Mark as Failed"
          >
            <XCircle size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Reflection({
  selected,
  onSaveReflection,
  onGeneratePrompt,
  onApplyNextPrompt,
}: {
  selected: Signal<EvaluationResult | null>;
  onSaveReflection: (resultId: number, notes: string, nextPrompt?: string) => Promise<void>;
  onGeneratePrompt: (resultId: number, alias: string, model: string) => Promise<EvaluationResult>;
  onApplyNextPrompt: (prompt: string) => Promise<void>;
}) {
  const selection = useLlmSelection();
  const result = selected.value;
  const generating = useSignal(false);
  const applying = useSignal(false);
  const generationKey = useSignal(0);

  const handleNotesBlur = useCallback((e: FocusEvent) => {
    if (!result) return;
    const notes = (e.target as HTMLTextAreaElement).value;
    const nextPrompt = result.nextPrompt ?? undefined;
    onSaveReflection(result.evaluation_result_id, notes, nextPrompt);
  }, [result, onSaveReflection]);

  const handleNextPromptBlur = useCallback((e: FocusEvent) => {
    if (!result) return;
    const nextPrompt = (e.target as HTMLTextAreaElement).value || undefined;
    const notes = result.notes ?? '';
    onSaveReflection(result.evaluation_result_id, notes, nextPrompt);
  }, [result, onSaveReflection]);

  return (
    <>
      <br />
      <p>
        Reflect on the outcome of this evaluation.  
        Take note of anything you noticed which worked or didn't work.  
        Suggest changes that would improve the outcomes
      </p>
      <br />
      <textarea
        key={`notes-${result?.evaluation_result_id}`}
        className="w-full h-40 border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-sm rounded"
        placeholder="Reflection notes..."
        defaultValue={result?.notes ?? ''}
        onBlur={handleNotesBlur}
      />
      <br />
      <br />
      <h5>Next Prompt</h5>
      <div className="flex gap-2">

        <textarea
          key={`next-prompt-${result?.evaluation_result_id}-${generationKey.value}`}
          className="w-full h-40 border border-zinc-300 dark:border-zinc-600 bg-transparent p-2 text-sm rounded "
          placeholder="Next prompt..."
          defaultValue={result?.nextPrompt ?? ''}
          onBlur={handleNextPromptBlur}
        />
        <aside className="flex flex-col gap-2">
          <Button
            variant="iconDefault"
            size="icon-lg"
            title="Generate New Prompt"
            className="bg-green-500/50 text-white disabled:animate-pulse group"
            disabled={generating.value || !result}
            onClick={async () => {
              if (!result || generating.value) return;
              generating.value = true;
              try {
                await onGeneratePrompt(
                  result.evaluation_result_id,
                  selection.selectedAlias.value,
                  selection.selectedModel.value,
                );
                generationKey.value += 1;
              } finally {
                generating.value = false;
              }
            }}
          >
            <Sparkle size={24} className="stroke-current group-disabled:animate-spin-windup " />
          </Button>
          <Button variant="iconDefault" title="Apply Next Prompt" className="bg-blue-500/50 text-white disabled:animate-pulse" disabled={applying.value || !result?.nextPrompt} onClick={async () => {
              if (!result?.nextPrompt || applying.value) return;
              applying.value = true;
              try {
                await onApplyNextPrompt(result.nextPrompt);
                toast.success('Prompt applied to evaluation');
              } catch {
                toast.error('Failed to apply prompt');
              } finally {
                applying.value = false;
              }
            }}>
            <SendHorizonal size={16} className="stroke-current" />
          </Button>
        </aside>
      </div>
      <LlmSelector llmSelection={selection} />
    </>
  )
}