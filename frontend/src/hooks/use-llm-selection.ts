import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const STORAGE_KEY = 'llm_selection';

export interface LlmEngine {
  alias: string;
  provider: string;
  defaultModel: string;
  location: string;
}

export interface LlmSelection {
  alias: string;
  model: string;
}

// --- Pure functions (extracted for testability) ---

export function loadPersistedSelection(): LlmSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LlmSelection;
  } catch {
    return null;
  }
}

export function persistSelection(alias: string, model: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ alias, model }));
}

export async function fetchEngines(): Promise<LlmEngine[]> {
  const res = await fetch('/api/v1/llm');
  if (!res.ok) throw new Error(`Failed to load LLM configs: ${res.status}`);
  const data = await res.json() as { apis: LlmEngine[] };
  return data.apis;
}

export async function fetchModels(alias: string): Promise<string[]> {
  const res = await fetch(`/api/v1/llm/models?alias=${encodeURIComponent(alias)}`);
  if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
  const data = await res.json() as { models: string[] };
  return data.models;
}

// --- Hook ---

export function useLlmSelection() {
  const persisted = loadPersistedSelection();

  const engines = useSignal<LlmEngine[]>([]);
  const models = useSignal<string[]>([]);
  const modelsError = useSignal<string | null>(null);

  const selectedAlias = useSignal<string>(persisted?.alias ?? '');
  const selectedModel = useSignal<string>(persisted?.model ?? '');

  // Load engine list on mount
  useEffect(() => {
    fetchEngines()
      .then(list => {
        engines.value = list;

        // If nothing was persisted, default to the first engine
        if (!selectedAlias.value && list.length > 0) {
          selectedAlias.value = list[0].alias;
          selectedModel.value = list[0].defaultModel;
        }
      })
      .catch(err => {
        console.error('Failed to fetch LLM engines:', err);
      });
  }, []);

  // Fetch models whenever the selected alias changes
  useEffect(() => {
    if (!selectedAlias.value) return;

    modelsError.value = null;
    models.value = [];

    fetchModels(selectedAlias.value)
      .then(list => {
        models.value = list;

        // If the persisted model is not in the new list, fall back to the engine's defaultModel
        if (list.length > 0 && !list.includes(selectedModel.value)) {
          const engine = engines.value.find(e => e.alias === selectedAlias.value);
          selectedModel.value = engine?.defaultModel ?? list[0];
        }

        persistSelection(selectedAlias.value, selectedModel.value);
      })
      .catch(err => {
        modelsError.value = err?.message ?? 'Failed to load models';
      });
  }, [selectedAlias.value]);

  function setAlias(alias: string) {
    selectedAlias.value = alias;
    // model will be updated after the models fetch above resolves
  }

  function setModel(model: string) {
    selectedModel.value = model;
    persistSelection(selectedAlias.value, model);
  }

  return {
    selectedAlias,
    selectedModel,
    engines,
    models,
    modelsError,
    setAlias,
    setModel,
  };
}
