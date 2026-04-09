import BaseLayout, { BaseLayoutShowBtn } from '@/components/layouts/base.layout';
import { getSourceLabel, sourceBadgeClass } from '@/components/agent-tool-list';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useSignal } from '@preact/signals';
import { listTools, type AgentToolView } from '@tkottke90/ai-assistant-client';
import { useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';
import { ToolDrawer } from './drawer';
import {
  buildSearch,
  canGoToNextPage,
  canGoToPreviousPage,
  clampPage,
  filterTools,
  paginateTools,
  totalPages,
} from './utils';

const PAGE_SIZE = 20;

// ── Pure helpers ───────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ToolRowProps {
  tool: AgentToolView;
  onClick: (tool: AgentToolView) => void;
}

function ToolRow({ tool, onClick }: ToolRowProps) {
  const label = getSourceLabel(tool.source, tool.mcp_server, tool.group);
  const badge = sourceBadgeClass(tool.source);
  return (
    <tr
      class="border-b dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600 cursor-pointer"
      onClick={() => onClick(tool)}
    >
      <td class="px-4 py-2 font-mono text-sm whitespace-nowrap">{tool.name}</td>
      <td class="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-300 max-w-xs">
        {truncate(tool.description, 100)}
      </td>
      <td class="px-4 py-2">
        <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
      </td>
      <td class="px-4 py-2 text-sm">{tool.group ?? <span class="opacity-40">—</span>}</td>
      <td class="px-4 py-2 text-sm font-mono text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {tool.mcp_server?.config_id ?? <span class="opacity-40">—</span>}
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function ToolsPage() {
  const { query, route } = useLocation();

  const committedKeyword: string = (query as Record<string, string>).keyword ?? '';
  const committedGroup: string = (query as Record<string, string>).group ?? '';
  const rawPage = parseInt((query as Record<string, string>).page ?? '1', 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  // Pending form state — initialised from URL on mount
  const pendingKeyword = useSignal(committedKeyword);
  const pendingGroup = useSignal(committedGroup);

  const selectedTool = useSignal<AgentToolView | null>(null);

  const toolsApi = useApi(() => listTools({}));

  useEffect(() => {
    toolsApi.execute();
  }, []);

  const allTools = toolsApi.value.value ?? [];
  const filtered = filterTools(allTools, { keyword: committedKeyword, group: committedGroup });
  const total = totalPages(filtered.length, PAGE_SIZE);
  const clampedPage = clampPage(page, total);
  const visibleTools = paginateTools(filtered, clampedPage, PAGE_SIZE);

  function handleSearch() {
    const search = buildSearch({ keyword: pendingKeyword.value, group: pendingGroup.value, page: 1 });
    route(`/tools${search ? '?' + search : ''}`);
  }

  function handleClear() {
    pendingKeyword.value = '';
    pendingGroup.value = '';
    route('/tools');
  }

  function handlePreviousPage() {
    if (canGoToPreviousPage(clampedPage)) {
      const search = buildSearch({ keyword: committedKeyword, group: committedGroup, page: clampedPage - 1 });
      route(`/tools?${search}`);
    }
  }

  function handleNextPage() {
    if (canGoToNextPage(clampedPage, total)) {
      const search = buildSearch({ keyword: committedKeyword, group: committedGroup, page: clampedPage + 1 });
      route(`/tools?${search}`);
    }
  }

  function handleRowClick(tool: AgentToolView) {
    selectedTool.value = tool;
  }

  function handleDrawerClose() {
    selectedTool.value = null;
    toolsApi.execute();
  }

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex flex-col gap-2 w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">
            Tools{' '}
            <span className="text-base opacity-50">({filtered.length} tools)</span>
          </h2>
        </span>
        <span className="flex gap-2 flex-wrap items-center">
          <input
            type="text"
            class="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 min-w-48"
            placeholder="Keyword (name, description, group, server)"
            value={pendingKeyword.value}
            onInput={(e) => { pendingKeyword.value = (e.target as HTMLInputElement).value; }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <input
            type="text"
            class="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 min-w-36"
            placeholder="Group (exact)"
            value={pendingGroup.value}
            onInput={(e) => { pendingGroup.value = (e.target as HTMLInputElement).value; }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <Button onClick={handleSearch}>Search</Button>
          <Button variant="outline" onClick={handleClear}>Clear</Button>
        </span>
      </header>

      <main className="w-full grow overflow-y-auto">
        {toolsApi.loading.value && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {!toolsApi.loading.value && toolsApi.error.value && (
          <p className="p-4 text-red-500">Failed to load tools: {toolsApi.error.value.message}</p>
        )}

        {!toolsApi.loading.value && !toolsApi.error.value && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b dark:border-neutral-600 text-xs uppercase opacity-60">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Group</th>
                <th className="px-4 py-2">MCP Server</th>
              </tr>
            </thead>
            <tbody>
              {visibleTools.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center opacity-50">
                    No tools match the current filters.
                  </td>
                </tr>
              )}
              {visibleTools.map((tool) => (
                <ToolRow key={tool.id} tool={tool} onClick={handleRowClick} />
              ))}
            </tbody>
          </table>
        )}
      </main>

      <footer className="flex items-center justify-between p-4 border-t dark:border-neutral-700">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Page {clampedPage} of {total} ({filtered.length} tools)
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePreviousPage}
            disabled={!canGoToPreviousPage(clampedPage)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={handleNextPage}
            disabled={!canGoToNextPage(clampedPage, total)}
          >
            Next
          </Button>
        </div>
      </footer>

      {selectedTool.value && (
        <ToolDrawer tool={selectedTool.value} onClose={handleDrawerClose} />
      )}
    </BaseLayout>
  );
}
