import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useLlmSelection } from "@/hooks/use-llm-selection";
import type { BaseProps } from "@/lib/utility-types";

interface LlmSelectorProps extends BaseProps {
  llmSelection: ReturnType<typeof useLlmSelection>;
  disabled?: boolean;
}

export function LlmSelector({ llmSelection, disabled = false }: LlmSelectorProps) {
  const { selectedAlias, selectedModel, engines, models, modelsError, setAlias, setModel } = llmSelection;

  return (
    <div className="flex flex-row items-start gap-2">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Engine</label>
        <select 
          id="engine"
          name="engine"
          value={selectedAlias.value}
          onChange={(e) => setAlias(e.currentTarget.value)}
          disabled={disabled || engines.value.length === 0}
          className="size-sm w-auto rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <option value="" disabled>Select engine</option>
          {engines.value.map(engine => (
            <option key={engine.alias} value={engine.alias}>{engine.alias}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-0.5 w-fit">
        <label className="text-xs text-muted-foreground">Model</label>
        <select
          id="model"
          name="model"
          value={selectedModel.value}
          onChange={(e) => setModel(e.currentTarget.value)}
          disabled={disabled || models.value.length === 0}
          className="size-sm w-fit max-w-[10rem] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <option value="" disabled>{modelsError.value ? 'Error loading models' : 'Select model'}</option>
          {models.value.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {modelsError.value && (
          <p className="text-xs text-destructive mt-0.5">{modelsError.value}</p>
        )}
      </div>
    </div>
  );
}
