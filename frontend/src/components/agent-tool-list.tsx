import { ConfirmButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type AgentToolView } from '@tkottke90/ai-assistant-client';
import type { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useSignal } from '@preact/signals';
import { Trash2 } from 'lucide-preact';
import { useEffect, useMemo } from 'preact/hooks';

// ── Pure utility functions ─────────────────────────────────────────────────────

/** Human-readable label describing where a tool comes from. */
export function getSourceLabel(source: string, mcpServer: { config_id: string } | null): string {
  if (source === 'built-in') return 'Built-in';
  if (source === 'simple') return 'Simple';
  if (source === 'mcp' && mcpServer) return `MCP: ${mcpServer.config_id}`;
  return source;
}

/** Tailwind badge classes for each tool source. */
export function sourceBadgeClass(source: string): string {
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
export function isSystemTool(lockedTier: number | null): boolean {
  return lockedTier !== null;
}

/** Label for a given numeric tier. */
export function tierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'Tier 1 — Requires Approval';
    case 2: return 'Tier 2 — Read Access';
    case 3: return 'Tier 3 — Full Access';
    default: return `Tier ${tier}`;
  }
}

/** Partition tools into built-ins, assigned, and available buckets. */
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

// ── Sub-components ─────────────────────────────────────────────────────────────

export function ToolSection({ title, description, actions, children }: {
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

export function ToolRowEmpty({ label }: { label: string }) {
  return (
    <p className="text-xs text-neutral-400 dark:text-neutral-500 px-2 py-3 italic">{label}</p>
  );
}

export function ToolRow({ tool, onTierChange, onRemove }: {
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

export function AvailableToolRow({ tool, onAdd }: {
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

// ── AgentToolList ──────────────────────────────────────────────────────────────

interface AgentToolListProps {
  tools: AgentToolView[] | null;
  loading: Signal<boolean>;
  onAdd: (tool: AgentToolView) => void;
  onRemove: (tool: AgentToolView) => void;
  onTierChange: (tool: AgentToolView, tier: 1 | 2 | 3) => void;
}

export function AgentToolList({ tools, loading, onAdd, onRemove, onTierChange }: AgentToolListProps) {
  const { builtins, assigned, available } = useMemo(
    () => partitionAgentToolViews(tools ?? []),
    [tools]
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

  return (
    <div className="overflow-auto p-2 space-y-4">
      <ToolSection
        title="Built-in Tools"
        description="Always available to every agent. Cannot be removed or re-tiered."
      >
        {builtins.map((t) => (
          <ToolRow key={t.tool_id} tool={t} onTierChange={onTierChange} onRemove={onRemove} />
        ))}
        {builtins.length === 0 && <ToolRowEmpty label="No built-in tools" />}
      </ToolSection>

      <ToolSection
        title="Assigned Tools"
        description="Tools this agent has access to. Adjust the tier to control how much user approval is required."
      >
        {assigned.map((t) => (
          <ToolRow key={t.tool_id} tool={t} onTierChange={onTierChange} onRemove={onRemove} />
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
          <AvailableToolRow key={t.tool_id} tool={t} onAdd={onAdd} />
        ))}
        {filteredAvailable.length === 0 && (
          <ToolRowEmpty label={debouncedQuery.value ? 'No tools match your search' : 'All registered tools are already assigned'} />
        )}
      </ToolSection>
    </div>
  );
}
