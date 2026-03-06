import { Drawer } from "@/components/drawer";
import { buttonVariants, ConfirmButton, LoadingButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { formatRelativeDate } from "@/lib/date-utils";
import { createContextWithHook } from "@/lib/utils";
import { Signal, useSignal } from "@preact/signals";
import {
  deleteAgentMemory,
  getAgentDetails,
  removeAgentTool,
  upsertAgentTool,
  viewAgentTools,
  updateAgent as updateAgentApi,
  type AgentDetails,
  type AgentListResponse,
  type AgentToolView,
  type CreateAgentInput,
  type Memory,
} from "@tkottke90/ai-assistant-client";
import type { ComponentChildren } from "preact";
import { Pencil, Trash2 } from "lucide-preact";
import { useCallback, useEffect, useMemo } from "preact/hooks";
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
              <ToolsTab />
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

// ── Tool tab utility functions ────────────────────────────────────────────────

/** Human-readable label describing where a tool comes from. */
function getSourceLabel(source: string, mcpServer: { config_id: string } | null): string {
  if (source === 'built-in') return 'Built-in';
  if (source === 'simple') return 'Simple';
  if (source === 'mcp' && mcpServer) return `MCP: ${mcpServer.config_id}`;
  return source;
}

/** Tailwind badge classes for each tool source. */
function sourceBadgeClass(source: string): string {
  switch (source) {
    case 'built-in':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200';
    case 'simple':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200';
    case 'mcp':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default:
      return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200';
  }
}

/** Whether a tool's tier is locked and cannot be changed. */
function isSystemTool(lockedTier: number | null): boolean {
  return lockedTier !== null;
}

/** Label for a given numeric tier. */
function tierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'Tier 1 — Requires Approval';
    case 2: return 'Tier 2 — Read Access';
    case 3: return 'Tier 3 — Full Access';
    default: return `Tier ${tier}`;
  }
}

// ── Tool tab: extracted functions (testable outside the component) ─────────────

export function partitionAgentToolViews(tools: AgentToolView[]): {
  builtins: AgentToolView[];
  assigned: AgentToolView[];
  available: AgentToolView[];
} {
  const builtins: AgentToolView[] = [];
  const assigned: AgentToolView[] = [];
  const available: AgentToolView[] = [];

  for (const t of tools) {
    if (t.locked_tier !== null) builtins.push(t);
    else if (t.assigned) assigned.push(t);
    else available.push(t);
  }

  return { builtins, assigned, available };
}

export async function handleToolTierChange(
  agentId: number,
  tool: AgentToolView,
  newTier: 1 | 2 | 3,
  refresh: () => void
): Promise<void> {
  await upsertAgentTool({ agentId, tool_id: tool.tool_id, tier: newTier });
  refresh();
}

export async function handleToolRemove(
  agentId: number,
  tool: AgentToolView,
  refresh: () => void
): Promise<void> {
  await removeAgentTool({ agentId, toolId: tool.tool_id });
  refresh();
}

export async function handleToolAdd(
  agentId: number,
  tool: AgentToolView,
  refresh: () => void
): Promise<void> {
  await upsertAgentTool({ agentId, tool_id: tool.tool_id, tier: tool.tier });
  refresh();
}

/**
 * Case-insensitive filter on tool name and namespaced ID.
 * Returns the full list unchanged when query is empty.
 */
export function filterAvailableTools(tools: AgentToolView[], query: string): AgentToolView[] {
  if (!query.trim()) return tools;
  const lower = query.toLowerCase();
  return tools.filter(
    (t) => t.name.toLowerCase().includes(lower) || t.id.toLowerCase().includes(lower)
  );
}

// ── ToolsTab component ───────────────────────────────────────────────

function ToolsTab() {
  const { agent } = useAgentDrawer();
  const agentId = agent.value?.agent_id;

  const { value: tools, loading, execute: refresh } = useApi(
    useCallback(() => {
      if (!agentId) return Promise.resolve([] as AgentToolView[]);
      return viewAgentTools({ agentId });
    }, [agentId])
  );

  useEffect(() => { refresh(); }, [agentId, refresh]);

  const { builtins, assigned, available } = useMemo(
    () => partitionAgentToolViews(tools.value ?? []),
    [tools.value]
  );

  const inputQuery = useSignal('');
  const debouncedQuery = useSignal('');

  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedQuery.value = inputQuery.value;
    }, 300);
    return () => clearTimeout(timer);
  }, [inputQuery.value]);

  const filteredAvailable = useMemo(
    () => filterAvailableTools(available, debouncedQuery.value),
    [available, debouncedQuery.value]
  );

  if (loading.value) {
    return (
      <div className="space-y-3 p-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!agent.value || !agentId) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-500 dark:text-neutral-400">
        Agent not found.
      </div>
    );
  }

  return (
    <div className="overflow-auto p-2 space-y-4">
      <ToolSection
        title="Built-in Tools"
        description="Always available to every agent. Cannot be removed or re-tiered."
      >
        {builtins.map((t) => (
          <ToolRow
            key={t.tool_id}
            tool={t}
            onTierChange={(tool, tier) =>
              handleToolTierChange(agentId, tool, tier, refresh).catch((err) =>
                toast.error(err instanceof Error ? err.message : 'Failed to update tier')
              )
            }
            onRemove={(tool) =>
              handleToolRemove(agentId, tool, refresh).catch((err) =>
                toast.error(err instanceof Error ? err.message : 'Failed to remove tool')
              )
            }
          />
        ))}
        {builtins.length === 0 && <ToolRowEmpty label="No built-in tools" />}
      </ToolSection>

      <ToolSection
        title="Assigned Tools"
        description="Tools this agent has access to. Adjust the tier to control how much user approval is required."
      >
        {assigned.map((t) => (
          <ToolRow
            key={t.tool_id}
            tool={t}
            onTierChange={(tool, tier) =>
              handleToolTierChange(agentId, tool, tier, refresh).catch((err) =>
                toast.error(err instanceof Error ? err.message : 'Failed to update tier')
              )
            }
            onRemove={(tool) =>
              handleToolRemove(agentId, tool, refresh).catch((err) =>
                toast.error(err instanceof Error ? err.message : 'Failed to remove tool')
              )
            }
          />
        ))}
        {assigned.length === 0 && <ToolRowEmpty label="No tools assigned yet" />}
      </ToolSection>

      <ToolSection
        title="Available Tools"
        description="Tools in the registry not yet assigned to this agent."
        actions={
          <input
            type="text"
            placeholder="Search…"
            value={inputQuery.value}
            onInput={(e) => { inputQuery.value = (e.target as HTMLInputElement).value; }}
            className="text-xs rounded px-2 py-1 w-40
              bg-neutral-200 dark:bg-neutral-700
              border border-neutral-300 dark:border-neutral-600
              placeholder:text-neutral-400 dark:placeholder:text-neutral-500
              focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
          />
        }
      >
        {filteredAvailable.map((t) => (
          <AvailableToolRow
            key={t.tool_id}
            tool={t}
            onAdd={(tool) =>
              handleToolAdd(agentId, tool, refresh).catch((err) =>
                toast.error(err instanceof Error ? err.message : 'Failed to add tool')
              )
            }
          />
        ))}
        {filteredAvailable.length === 0 && (
          <ToolRowEmpty label={debouncedQuery.value ? 'No tools match your search' : 'All registered tools are already assigned'} />
        )}
      </ToolSection>
    </div>
  );
}

// ── Tool tab sub-components ──────────────────────────────────────────

function ToolSection({ title, description, actions, children }: {
  title: string;
  description: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section className="space-y-1">
      <div className="flex justify-between items-start px-1 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
        </div>
        {actions && <div className="ml-4 shrink-0">{actions}</div>}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ToolRowEmpty({ label }: { label: string }) {
  return (
    <p className="text-xs text-neutral-400 dark:text-neutral-500 px-2 py-3 italic">{label}</p>
  );
}

function ToolRow({ tool, onTierChange, onRemove }: {
  tool: AgentToolView;
  onTierChange: (tool: AgentToolView, tier: 1 | 2 | 3) => void;
  onRemove: (tool: AgentToolView) => void;
}) {
  const locked = isSystemTool(tool.locked_tier);
  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-neutral-900 dark:text-neutral-100">
          {tool.name}
          {locked && <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500 font-normal">system</span>}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate font-mono">{tool.id}</p>
      </div>
      <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium ${sourceBadgeClass(tool.source)}`}>
        {getSourceLabel(tool.source, tool.mcp_server)}
      </span>
      <select
        disabled={locked}
        value={tool.tier}
        onChange={(e) => onTierChange(tool, Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3)}
        className="text-xs rounded px-2 py-1
          bg-neutral-200 dark:bg-neutral-700
          border border-neutral-300 dark:border-neutral-600
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value={1}>{tierLabel(1)}</option>
        <option value={2}>{tierLabel(2)}</option>
        <option value={3}>{tierLabel(3)}</option>
      </select>
      <ConfirmButton
        size="icon-xs"
        disabled={locked}
        onConfirm={() => onRemove(tool)}
      >
        <Trash2 className="size-full" />
      </ConfirmButton>
    </div>
  );
}

function AvailableToolRow({ tool, onAdd }: {
  tool: AgentToolView;
  onAdd: (tool: AgentToolView) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-neutral-500 dark:text-neutral-400">{tool.name}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate font-mono">{tool.id}</p>
      </div>
      <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium ${sourceBadgeClass(tool.source)}`}>
        {getSourceLabel(tool.source, tool.mcp_server)}
      </span>
      <button
        onClick={() => onAdd(tool)}
        className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        + Add
      </button>
    </div>
  );
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