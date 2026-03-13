import { Drawer } from "@/components/drawer";
import { formatRelativeDate } from "@/lib/date-utils";
import { useComputed, useSignal, useSignalEffect, type Signal } from "@preact/signals";
import type { EvaluationResult, TestCaseResult } from "@tkottke90/ai-assistant-client";


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
}: {
  selectedResult: Signal<EvaluationResult | null>;
  results: Signal<EvaluationResult[]>;
  setSelectedResult: (result: EvaluationResult | null) => void;
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
      <EvaluationDrawer selected={selectedResult} setSelected={setSelectedResult} />
    </div>
  );
}


export function EvaluationDrawer({ selected, setSelected }: { selected: Signal<EvaluationResult | null>, setSelected: (result: EvaluationResult | null) => void }) {
  const eventTrigger = useSignal(new EventTarget());

  useSignalEffect(() => {
    console.dir(selected.value);

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
    >

    </Drawer>
  )
}