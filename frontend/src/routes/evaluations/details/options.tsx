import { Collapsable } from "@/components/collapsable-section";
import { LlmSelector } from "@/components/llm-selector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import type { BaseProps } from "@/lib/utility-types";
import { Signal, useSignal } from "@preact/signals";


export function EvaluationOptions({ scoringInProgress }: BaseProps<{ scoringInProgress: Signal<boolean> }>) {
  const collapsed = useSignal(true);

  return (
    <Collapsable
      title="Configuration"
      startedOpen={false}
      mobileOnly
      className="shrink-0 lg:row-span-2 h-fit"
    >
      <main className="overflow-y-auto">
        <Tabs defaultValue="llm" className="w-full h-full">
          <TabsList variant="line" className="
            *:text-neutral-800 dark:*:text-neutral-200 
            *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
            *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
          ">
            <TabsTrigger value="llm">LLM Options</TabsTrigger>
            <TabsTrigger value="tools">Tool Access</TabsTrigger>
          </TabsList>
          <TabsContent value="llm" className="h-full overflow-auto">
            <LLMTab scoringInProgress={scoringInProgress} />
          </TabsContent>
          <TabsContent value="tools">
            <ToolTab />
          </TabsContent>
        </Tabs>
      </main>
    </Collapsable>
  )
}

export function LLMTab({ scoringInProgress }: BaseProps<{ scoringInProgress: Signal<boolean> }>) {
  const llmSelection = useLlmSelection();

  return (
    <form >
      <LlmSelector llmSelection={llmSelection} />

      <label htmlFor="temp">Temperature</label>
      <input
        id="temp"
        name="temp"
        type="number"
        min={0}
        max={1}
        step={0.1}
        defaultValue={0.7}
        className="size-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
      />

      <label htmlFor="maxTokens">Max Tokens</label>
      <input
        id="maxTokens"
        name="maxTokens"
        type="number"
        min={1}
        step={1}
        defaultValue={2048}
        className="size-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
      />

      <label htmlFor="maxTokens">Top P</label>
      <input
        id="maxTokens"
        name="maxTokens"
        type="number"
        min={1}
        step={0.1}
        defaultValue={1}
        className="size-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
      />

      <label htmlFor="maxTokens">Top K</label>
      <input
        id="maxTokens"
        name="maxTokens"
        type="number"
        min={1}
        step={1}
        defaultValue={40}
        className="size-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
      />
    </form>
  )
}

export function ToolTab() {


  return (<div>
      <p>Tool Access</p>
    </div>
  )
}