import type { AgentToolView } from '@tkottke90/ai-assistant-client';

// ── Filter helpers ─────────────────────────────────────────────────────────────

/** Returns true when the tool matches the keyword across name, description, group, and mcp_server config_id. */
export function passesKeyword(tool: AgentToolView, keyword: string): boolean {
  if (!keyword.trim()) return true;
  const lower = keyword.toLowerCase();
  return (
    tool.name.toLowerCase().includes(lower) ||
    tool.description.toLowerCase().includes(lower) ||
    (tool.group?.toLowerCase().includes(lower) ?? false) ||
    (tool.mcp_server?.config_id.toLowerCase().includes(lower) ?? false)
  );
}

/** Returns true when the tool's group exactly matches the filter (case-insensitive). */
export function passesGroup(tool: AgentToolView, group: string): boolean {
  if (!group.trim()) return true;
  if (tool.group === null) return false;
  return tool.group.toLowerCase() === group.toLowerCase();
}

/** Filter tools by keyword (OR across fields) and group (exact match), AND-ed together. */
export function filterTools(
  tools: AgentToolView[],
  filters: { keyword: string; group: string }
): AgentToolView[] {
  return tools.filter(
    (t) => passesKeyword(t, filters.keyword) && passesGroup(t, filters.group)
  );
}

// ── Pagination helpers ────────────────────────────────────────────────────────

/** Return one page worth of items from the full list (1-based page). */
export function paginateTools(tools: AgentToolView[], page: number, pageSize: number): AgentToolView[] {
  const start = (page - 1) * pageSize;
  return tools.slice(start, start + pageSize);
}

/** Total number of pages needed for `count` items at `pageSize` per page. */
export function totalPages(count: number, pageSize: number): number {
  if (count === 0) return 1;
  return Math.ceil(count / pageSize);
}

/** Clamp page to [1, total]. */
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), total);
}

/** Whether there is a next page to go to. */
export function canGoToNextPage(currentPage: number, total: number): boolean {
  return currentPage < total;
}

/** Whether there is a previous page to go to. */
export function canGoToPreviousPage(currentPage: number): boolean {
  return currentPage > 1;
}

// ── URL param helpers ─────────────────────────────────────────────────────────

export interface ToolsFilters {
  keyword: string;
  group: string;
  page: number;
}

/** Parse filter state from a URL search string (e.g. location.search). */
export function parseFiltersFromSearch(search: string): ToolsFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const page = parseInt(params.get('page') ?? '1', 10);
  return {
    keyword: params.get('keyword') ?? '',
    group: params.get('group') ?? '',
    page: isNaN(page) || page < 1 ? 1 : page,
  };
}

/** Serialize filter state back to a query string (without leading '?'). */
export function buildSearch(filters: ToolsFilters): string {
  const params = new URLSearchParams();
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.group) params.set('group', filters.group);
  if (filters.page !== 1) params.set('page', String(filters.page));
  return params.toString();
}
