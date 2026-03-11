import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { EvaluationOptions } from "./options";
import { TestCases } from "./test-cases";
import { useSignal } from "@preact/signals";

export function EvaluationDetailsPage() {
  const scoringInProgress = useSignal(true);

  return (
    <BaseLayout className="flex flex-col gap-4">
      <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Prompt Details</h2>
        </span>
        <span className="inline-flex gap-2">
          <Button variant="outline">Create Agent</Button>
          <Button disabled={scoringInProgress.value} variant="constructive">Execute</Button>
          <Button variant="constructive">Save</Button>
        </span>
      </header>
      <main className="grow gap-4
        flex flex-col overflow-auto pr-4
        lg:grid lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_auto_1fr]

        *:border *:rounded-md *:bg-elevated *:p-2 *:shadow-lg
        ">
        <section className="col-span-2">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            className="text-xl lg:text-sm border-none w-full bg-neutral-600 rounded p-2"
          />

          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            className="text-lg lg:text-sm border-none w-full bg-neutral-600 rounded p-2 min-h-10 h-10"
          ></textarea>
        </section>
        <section className="h-fit">
          <h4>Prompt</h4>
          <textarea
            className="text-xl lg:text-sm border-none w-full bg-neutral-600 rounded p-2 min-h-10 h-10"
          ></textarea>
        </section>
        <EvaluationOptions scoringInProgress={scoringInProgress} />
        <TestCases scoringInProgress={scoringInProgress} />
      </main>
    </BaseLayout>
  );
}