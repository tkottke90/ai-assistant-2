import { Dialog, useDialog } from "@/components/dialog";
import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";
import { listEvaluations, createEvaluation, type Evaluation } from "@tkottke90/ai-assistant-client";
import { useCallback, useEffect, useRef } from "preact/hooks";
import { useLocation } from "preact-iso";

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300';
  if (status === 'Completed') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (status === 'Running') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  if (status === 'Failed') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300';
}

function EvaluationCard({ evaluation }: { evaluation: Evaluation & { last_run_status: string | null } }) {
  const { route } = useLocation();
  return (
    <div
      className="border rounded-lg p-4 bg-elevated shadow cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors"
      onClick={() => route(`/evaluations/${evaluation.evaluation_id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{evaluation.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">{evaluation.description}</p>
        </div>
        {evaluation.last_run_status && (
          <span className={cn('text-xs px-2 py-0.5 rounded font-medium shrink-0', statusBadgeClass(evaluation.last_run_status))}>
            {evaluation.last_run_status}
          </span>
        )}
      </div>
    </div>
  );
}

function CreateEvalForm() {
  const { route } = useLocation();
  const { close } = useDialog();
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const handleCreate = useCallback(async () => {
    const name = nameRef.current?.value?.trim() ?? '';
    const description = descRef.current?.value?.trim() ?? '';
    if (!name) return;
    try {
      const created = await createEvaluation({
        name,
        description,
        prompt: '',
        llm_config: { alias: '', model: '' },
        test_cases: [],
      });
      close();
      route(`/evaluations/${created.evaluation_id}`);
    } catch (err) {
      console.error('Failed to create evaluation:', err);
    }
  }, [route, close]);

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div>
        <label htmlFor="eval-name" className="text-sm font-medium block mb-1">Name</label>
        <input
          id="eval-name"
          ref={nameRef}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="My evaluation"
        />
      </div>
      <div>
        <label htmlFor="eval-description" className="text-sm font-medium block mb-1">Description</label>
        <textarea
          id="eval-description"
          ref={descRef}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-16"
          placeholder="What does this evaluation test?"
        />
      </div>
      <div className="flex justify-end">
        <Button variant="constructive" onClick={handleCreate}>Create</Button>
      </div>
    </div>
  );
}

export function EvaluationsPage() {
  const evaluations = useApi(useCallback(() => listEvaluations({}), []));

  useEffect(() => { evaluations.execute(); }, []);

  return (
    <BaseLayout className="flex flex-col gap-4">
      <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Evaluations</h2>
        </span>
        <span className="flex gap-2">
          <Dialog
            title="Create New Eval"
            trigger={<button className={cn(buttonVariants({ variant: 'default', size: 'default' }))}>Create Data Set</button>}
          >
            <CreateEvalForm />
          </Dialog>
        </span>
      </header>
      <main className="flex flex-col gap-2">
        {evaluations.loading.value && <p className="text-sm text-neutral-500">Loading...</p>}
        {!evaluations.loading.value && !evaluations.value.value?.length && (
          <p className="text-sm text-neutral-500 text-center py-8">No evaluations yet. Create one to get started.</p>
        )}
        {evaluations.value.value?.map((evaluation) => (
          <EvaluationCard key={evaluation.evaluation_id} evaluation={evaluation as any} />
        ))}
      </main>
    </BaseLayout>
  );
}

