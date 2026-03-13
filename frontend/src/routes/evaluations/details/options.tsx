import { AgentToolList } from "@/components/agent-tool-list";
import { Collapsable } from "@/components/collapsable-section";
import { LlmSelector } from "@/components/llm-selector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { useLocalToolSelection } from "@/hooks/use-local-tool-selection";
import type { EvaluationFormState } from "@/hooks/use-evaluation";
import { type ReadonlySignal, type Signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface EvalOptionsProps {
  scoringInProgress: ReadonlySignal<boolean>;
  evalForm: Signal<EvaluationFormState>;
  updateEvalForm: (patch: Partial<EvaluationFormState>) => void;
}

export function EvaluationOptions({ scoringInProgress, evalForm, updateEvalForm }: EvalOptionsProps) {
  return (
    <Collapsable
      title="Configuration"
      startedOpen={false}
      mobileOnly
      className="shrink-0 lg:row-span-2 h-full"
    >
      <main className="h-full">
        <Tabs defaultValue="llm" className="w-full h-full">
          <TabsList variant="line" className="
            *:text-neutral-800 dark:*:text-neutral-200 
            *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
            *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
          ">
            <TabsTrigger value="llm">LLM Options</TabsTrigger>
            <TabsTrigger value="tools">Tool Access</TabsTrigger>
          </TabsList>
          <TabsContent value="llm" className="h-full overflow-y-auto pr-4">
            <LLMTab scoringInProgress={scoringInProgress} evalForm={evalForm} updateEvalForm={updateEvalForm} />
          </TabsContent>
          <TabsContent value="tools" className="h-full overflow-y-auto pr-4">
            <ToolTab evalForm={evalForm} updateEvalForm={updateEvalForm} />
            <br />
          </TabsContent>
        </Tabs>
      </main>
    </Collapsable>
  )
}

export function LLMTab({ evalForm, updateEvalForm }: Pick<EvalOptionsProps, 'evalForm' | 'updateEvalForm' | 'scoringInProgress'>) {
  const llmSelection = useLlmSelection();

  // Seed the LLM selection from the form on mount
  useEffect(() => {
    const { alias, model } = evalForm.value.llmConfig;
    if (alias) llmSelection.selectedAlias.value = alias;
    if (model) llmSelection.selectedModel.value = model;
  }, []);

  // Keep form in sync when the user changes the LLM selection
  useEffect(() => {
    const alias = llmSelection.selectedAlias.value;
    const model = llmSelection.selectedModel.value;
    if (!alias) return;
    updateEvalForm({ llmConfig: { ...evalForm.value.llmConfig, alias, model } });
  }, [llmSelection.selectedAlias.value, llmSelection.selectedModel.value]);

  const inputClass = "size-sm w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 mb-2";

  return (
    <form>
      <LlmSelector llmSelection={llmSelection} />
      <br />
      <label htmlFor="temp">Temperature</label>
      <input
        id="temp"
        name="temp"
        type="number"
        min={0}
        max={2}
        step={0.1}
        defaultValue={evalForm.value.llmConfig.temperature ?? 0.7}
        onChange={(e) => updateEvalForm({ llmConfig: { ...evalForm.value.llmConfig, temperature: parseFloat((e.target as HTMLInputElement).value) } })}
        className={inputClass}
      />

      <label htmlFor="maxTokens">Max Tokens</label>
      <input
        id="maxTokens"
        name="maxTokens"
        type="number"
        min={1}
        step={1}
        defaultValue={evalForm.value.llmConfig.maxTokens ?? 2048}
        onChange={(e) => updateEvalForm({ llmConfig: { ...evalForm.value.llmConfig, maxTokens: parseInt((e.target as HTMLInputElement).value) } })}
        className={inputClass}
      />

      <label htmlFor="topP">Top P</label>
      <input
        id="topP"
        name="topP"
        type="number"
        min={0}
        max={1}
        step={0.1}
        defaultValue={evalForm.value.llmConfig.topP ?? 1}
        onChange={(e) => updateEvalForm({ llmConfig: { ...evalForm.value.llmConfig, topP: parseFloat((e.target as HTMLInputElement).value) } })}
        className={inputClass}
      />

      <label htmlFor="topK">Top K</label>
      <input
        id="topK"
        name="topK"
        type="number"
        min={1}
        step={1}
        defaultValue={evalForm.value.llmConfig.topK ?? 40}
        onChange={(e) => updateEvalForm({ llmConfig: { ...evalForm.value.llmConfig, topK: parseInt((e.target as HTMLInputElement).value) } })}
        className={inputClass}
      />
    </form>
  )
}

export function ToolTab({ evalForm, updateEvalForm }: Pick<EvalOptionsProps, 'evalForm' | 'updateEvalForm'>) {
  const { tools, loading, onAdd, onRemove, onTierChange } = useLocalToolSelection(evalForm.value.selectedTools);

  // Keep form in sync when tools change
  useEffect(() => {
    updateEvalForm({ selectedTools: tools.value.filter(t => t.assigned).map(t => ({ tool_id: t.tool_id, tier: t.tier })) });
  }, [tools.value]);

  return (
    <AgentToolList
      tools={tools.value}
      loading={loading}
      onAdd={onAdd}
      onRemove={onRemove}
      onTierChange={onTierChange}
    />
  );
}