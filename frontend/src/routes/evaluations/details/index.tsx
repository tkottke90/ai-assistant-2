import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { EvaluationOptions } from "./options";
import { TestCases } from "./test-cases";
import { useEvaluation } from "@/hooks/use-evaluation";
import { useRoute } from "preact-iso";
import { useComputed } from "@preact/signals";
import { Collapsable } from "@/components/collapsable-section";

export function EvaluationDetailsPage() {
  const route = useRoute();
  const evaluationId = parseInt(route.params?.evaluationId ?? '0', 10);

  const {
    evalForm,
    updateEvalForm,
    activeResult,
    selectedResult,
    setSelectedResult,
    results,
    saving,
    executing,
    save,
    execute,
    complete,
    scoreCase,
  } = useEvaluation(evaluationId);

  const scoringInProgress = useComputed(() => activeResult.value?.status === 'Running');
  const canExecute = useComputed(
    () => !executing.value && (!activeResult.value || activeResult.value.status !== 'Running'),
  );

  return (
    <BaseLayout className="flex flex-col gap-4">
      <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">{evalForm.value.name || 'Evaluation Details'}</h2>
        </span>
        <span className="inline-flex gap-2">
          <Button
            disabled={!canExecute.value}
            variant="constructive"
            onClick={execute}
          >
            {executing.value ? 'Running…' : 'Execute'}
          </Button>
          <Button variant="constructive" disabled={saving.value} onClick={save}>
            {saving.value ? 'Saving…' : 'Save'}
          </Button>
        </span>
      </header>
      <main className="grow gap-4
        flex flex-col overflow-auto pr-4
        lg:grid lg:grid-cols-[1fr_450px] lg:grid-rows-[auto_auto_1fr]

        *:border *:rounded-md *:bg-elevated *:p-2 *:shadow-lg
        ">
        <section className="col-span-2">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            key={`name-${evaluationId}`}
            defaultValue={evalForm.value.name}
            onChange={(e) => updateEvalForm({ name: (e.target as HTMLInputElement).value })}
            className="text-xl lg:text-sm border-none w-full bg-neutral-600 rounded p-2"
          />
          <br />
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            key={`desc-${evaluationId}`}
            defaultValue={evalForm.value.description}
            onChange={(e) => updateEvalForm({ description: (e.target as HTMLTextAreaElement).value })}
            className="text-lg lg:text-sm border-none w-full bg-neutral-600 rounded p-2 min-h-10 h-10"
          />
        </section>

        <Collapsable title="Prompt" startedOpen={true}>
          <textarea
            key={`prompt-${evaluationId}`}
            defaultValue={evalForm.value.prompt}
            onChange={(e) => updateEvalForm({ prompt: (e.target as HTMLTextAreaElement).value })}
            className="text-xl lg:text-sm border-none w-full bg-neutral-600 rounded p-2 min-h-10 h-10"
          />
        </Collapsable>

        <EvaluationOptions
          scoringInProgress={scoringInProgress}
          evalForm={evalForm}
          updateEvalForm={updateEvalForm}
        />
        
        <TestCases
          evalForm={evalForm}
          updateEvalForm={updateEvalForm}
          selectedResult={selectedResult}
          onSelectedResult={setSelectedResult}
          results={results}
          onScoreCase={scoreCase}
          onComplete={complete}
        />
      </main>
    </BaseLayout>
  );
}