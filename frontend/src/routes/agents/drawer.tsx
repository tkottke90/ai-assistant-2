import { Drawer } from "@/components/drawer";
import { AgentToolList } from "@/components/agent-tool-list";
import { LlmSelector } from "@/components/llm-selector";
import { buttonVariants, ConfirmButton, LoadingButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { useAgentTools } from "@/hooks/use-agent-tools";
import { useLlmSelection } from "@/hooks/use-llm-selection";
import { formatRelativeDate } from "@/lib/date-utils";
import { createContextWithHook } from "@/lib/utils";
import { Signal, useSignal } from "@preact/signals";
import {
  deleteAgentMemory,
  getAgentDetails,
  updateAgent as updateAgentApi,
  type AgentDetails,
  type AgentListResponse,
  type CreateAgentInput,
  type Memory,
} from "@tkottke90/ai-assistant-client";
import { Pencil, Trash2 } from "lucide-preact";
import { useCallback, useEffect } from "preact/hooks";
import { toast } from "sonner";
import { AgentTitle } from "./title";


const { Provider: AgentDrawerContext, useHook: useAgentDrawer } = createContextWithHook<{
  agent: Signal<AgentListResponse | null>;
  details: Signal<AgentDetails | null>;
  detailsLoading: Signal<boolean>;
  updateAgent: (updates: Partial<CreateAgentInput>) => Promise<void>;
  refreshDetails: () => void;
}>()

interface iAgentDrawerProps {
  agent: AgentListResponse;
  onChange?: () => void;
}

export function AgentDrawer(props: iAgentDrawerProps) {
  const agent = useSignal(props.agent);

  const { value: details, loading: detailsLoading, execute: fetchDetails } = useApi(
    useCallback(() => getAgentDetails({ id: props.agent.agent_id }), [props.agent.agent_id])
  );

  const { tools, loading: toolsLoading, onAdd, onRemove, onTierChange } = useAgentTools(props.agent.agent_id);

  const updateAgent = useCallback(async (updates: Partial<CreateAgentInput>) => {
    if (!agent.value) return;

    const result = await updateAgentApi({ id: agent.value.agent_id, ...updates });
    agent.value = { ...result, is_active: agent.value.is_active };
  }, []);

  return (
    <Drawer
      title={<AgentTitle agent={agent.value} />}
      trigger={<button className={buttonVariants({ size: "icon-xs", variant: "iconInfo" })}><Pencil className="size-full" /></button>}
      className="flex flex-col"
      onOpen={fetchDetails}
      onClose={() => props.onChange?.()}
    >
      <AgentDrawerContext value={{ agent, details, detailsLoading, updateAgent, refreshDetails: fetchDetails }}>
        <header className="mb-4 min-h-16">
          <p>
            <strong>ID:&nbsp;</strong>
            {agent.value.agent_id}
          </p>
          <p>
            <strong>Description:&nbsp;</strong>
            {agent.value.description}
          </p>
        </header>
        <main className="grow overflow-auto">
          <Tabs defaultValue="system_prompt" className="w-full h-full">
            <TabsList variant="line" className="
              *:text-neutral-800 dark:*:text-neutral-200 
              *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
              *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
            ">
              <TabsTrigger value="system_prompt">System Prompt</TabsTrigger>
              <TabsTrigger value="tools">Tool Access</TabsTrigger>
              <TabsTrigger value="memories">Memories</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="full_prompt">Full Prompt</TabsTrigger>
            </TabsList>
            <hr className="mt-2 opacity-50" />
            <TabsContent value="system_prompt" className="h-full overflow-auto">
              <SystemPromptTab />
            </TabsContent>
            <TabsContent value="tools">
              <AgentToolList
                tools={tools.value}
                loading={toolsLoading}
                onAdd={onAdd}
                onRemove={onRemove}
                onTierChange={onTierChange}
              />
            </TabsContent>
            <TabsContent value="memories">
              <MemoriesTab />
            </TabsContent>
            <TabsContent value="options">
              <OptionsTab />
            </TabsContent>
            <TabsContent value="full_prompt" className="h-full overflow-auto">
              <FullPromptTab />
            </TabsContent>
          </Tabs>
        </main>
      </AgentDrawerContext>
    </Drawer>
  )
}

function SystemPromptTab() {
  const { agent, updateAgent } = useAgentDrawer();

  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  return (
    <form
      className="h-full flex flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        loading.value = true;
        error.value = null;

        try {
          const formData = new FormData(e.currentTarget);
          const systemPrompt = formData.get('system_prompt') as string;
          await updateAgent({ system_prompt: systemPrompt });
        } catch (err) {
          error.value = err instanceof Error ? err.message : 'Failed to save system prompt';
        } finally {
          loading.value = false;
        }
      }}
    >
      <main className="grow p-2">
        <textarea
          id="system_prompt"
          name="system_prompt"
          disabled={loading.value}
          defaultValue={agent.value?.system_prompt ?? ''}
          className="w-full h-48 p-2 rounded-md resize-none
            bg-neutral-200 dark:bg-neutral-600
          "
          placeholder="You are a helpful assistant who tries to help the user as best as possible."
        />
        {error.value && (
          <p className="mt-1 text-sm text-red-500 dark:text-red-400">{error.value}</p>
        )}
      </main>
      <footer className="flex justify-end gap-2">
        <LoadingButton
          loading={loading}
          variant="constructive"
          type="submit"
        >
          Save
        </LoadingButton>
      </footer>
    </form>
  )
}

// ── Pure utility functions (extracted per UI guidelines) ──

/** Strips the 'memory:' prefix and capitalizes the memory type for display. */
function formatMemoryType(type: string): string {
  const raw = type.startsWith('memory:') ? type.slice('memory:'.length) : type;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Badge color classes for each memory type. */
function memoryTypeBadgeClass(type: string): string {
  const raw = type.startsWith('memory:') ? type.slice('memory:'.length) : type;
  switch (raw) {
    case 'semantic':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'episodic':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'procedural':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200';
  }
}

function MemoriesTab() {
  const { agent, details, detailsLoading, refreshDetails } = useAgentDrawer();
  const deletingId = useSignal<number | null>(null);

  const memories = details.value?.memories?.data ?? [];

  const handleDelete = async (memory: Memory) => {
    if (!agent.value) return;
    deletingId.value = memory.node_id;
    try {
      await deleteAgentMemory({ id: agent.value.agent_id, nodeId: memory.node_id });
      toast.success('Memory deleted');
      refreshDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete memory');
    } finally {
      deletingId.value = null;
    }
  };

  if (detailsLoading.value) {
    return (
      <div className="space-y-3 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-400">
        <p>This agent has no memories yet. Memories are created automatically during conversations.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto p-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 dark:border-neutral-600 text-left">
            <th className="py-2 pr-3 font-medium w-28">Type</th>
            <th className="py-2 pr-3 font-medium">Content</th>
            <th className="py-2 pr-3 font-medium w-28">Created</th>
            <th className="py-2 font-medium w-12"></th>
          </tr>
        </thead>
        <tbody>
          {memories.map((memory) => (
            <tr
              key={memory.node_id}
              className="border-b border-neutral-200 dark:border-neutral-700 last:border-0"
            >
              <td className="py-2 pr-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${memoryTypeBadgeClass(memory.type)}`}>
                  {formatMemoryType(memory.type)}
                </span>
              </td>
              <td className="py-2 pr-3 max-w-xs truncate" title={memory.properties.content}>
                {memory.properties.content}
              </td>
              <td className="py-2 pr-3 text-neutral-500 dark:text-neutral-400 text-xs whitespace-nowrap">
                {formatRelativeDate(memory.created_at)}
              </td>
              <td className="py-2">
                <ConfirmButton
                  size="icon-xs"
                  disabled={deletingId.value === memory.node_id}
                  onConfirm={() => handleDelete(memory)}
                >
                  <Trash2 className="size-full" />
                </ConfirmButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionsTab() {
  const { agent, updateAgent } = useAgentDrawer();
  const loading = useSignal(false);
  const llmLoading = useSignal(false);
  const error = useSignal<string | null>(null);
  const llmSelection = useLlmSelection();

  // Seed the LLM selector with the agent's current engine/model on mount
  useEffect(() => {
    if (agent.value?.engine) {
      llmSelection.selectedAlias.value = agent.value.engine;
    }
    if (agent.value?.model) {
      llmSelection.selectedModel.value = agent.value.model;
    }
  }, []);

  const handleAutoStartChange = async (checked: boolean) => {
    loading.value = true;
    error.value = null;
    try {
      await updateAgent({ auto_start: checked });
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update option';
    } finally {
      loading.value = false;
    }
  };

  const handleLlmSave = async () => {
    llmLoading.value = true;
    error.value = null;
    try {
      await updateAgent({
        engine: llmSelection.selectedAlias.value || undefined,
        model: llmSelection.selectedModel.value || undefined,
      });
      toast.success('Model settings saved');
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save model settings';
    } finally {
      llmLoading.value = false;
    }
  };

  return (
    <div className="p-2 space-y-4 flex flex-col h-full">
      <div className="grow">
        <div className="flex items-center justify-between rounded-md p-3 bg-neutral-100 dark:bg-neutral-700">          <div>
            <p className="font-medium text-sm">Auto Start</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Automatically start this agent when the application loads.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={agent.value?.auto_start ?? false}
            disabled={loading.value}
            onClick={(e) => {
              e.preventDefault();
              handleAutoStartChange(!(agent.value?.auto_start ?? false));
            }}
            className={[
              "relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
              "disabled:cursor-not-allowed disabled:opacity-50",
              agent.value?.auto_start
                ? "bg-blue-500 dark:bg-blue-600"
                : "bg-neutral-300 dark:bg-neutral-600",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none absolute top-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                agent.value?.auto_start ? "translate-x-4.5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </div>

        <div className="rounded-md p-3 bg-neutral-100 dark:bg-neutral-700 space-y-3">
          <div>
            <p className="font-medium text-sm">Model / Engine</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Select the LLM engine and model for this agent.
            </p>
          </div>
          <LlmSelector llmSelection={llmSelection} disabled={llmLoading.value} />
        </div>

        {error.value && (
          <p className="text-sm text-red-500 dark:text-red-400">{error.value}</p>
        )}
      </div>

      <div className="flex justify-end">
        <LoadingButton
          loading={llmLoading}
          variant="constructive"
          onClick={handleLlmSave}
        >
          Save
        </LoadingButton>
      </div>
    </div>
  );
}

function FullPromptTab() {
  const { details, detailsLoading } = useAgentDrawer();

  if (detailsLoading.value) {
    return (
      <div className="space-y-3 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!details.value?.full_system_prompt) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-400">
        <p>Full prompt unavailable — agent is not currently registered in the runtime.</p>
      </div>
    );
  }

  return (
    <div className="h-full p-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
        Read-only. This is the complete system prompt the agent receives, including injected tool and memory instructions.
      </p>
      <pre className="w-full h-full p-3 rounded-md text-sm whitespace-pre-wrap overflow-auto
        bg-neutral-200 dark:bg-neutral-600 text-neutral-800 dark:text-neutral-100
        font-mono leading-relaxed
      ">
        {details.value.full_system_prompt}
      </pre>
    </div>
  );
}