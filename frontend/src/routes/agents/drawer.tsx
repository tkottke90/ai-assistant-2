import { Drawer } from "@/components/drawer";
import { AgentToolList } from "@/components/agent-tool-list";
import { buttonVariants, ConfirmButton, LoadingButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { useAgentTools } from "@/hooks/use-agent-tools";
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
import { useCallback } from "preact/hooks";
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
    props.onChange?.();
  }, []);

  return (
    <Drawer
      title={<AgentTitle agent={agent.value} />}
      trigger={<button className={buttonVariants({ size: "icon-xs", variant: "iconInfo" })}><Pencil className="size-full" /></button>}
      className="flex flex-col"
      onOpen={fetchDetails}
    >
      <AgentDrawerContext value={{ agent, details, detailsLoading, updateAgent, refreshDetails: fetchDetails }}>
        <header className="mb-4 min-h-16">
          <p><strong>Description:&nbsp;</strong>{agent.value.description}</p>
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
            </TabsList>
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