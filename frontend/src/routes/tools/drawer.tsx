import { Drawer } from '@/components/drawer';
import { getSourceLabel, sourceBadgeClass } from '@/components/agent-tool-list';
import { LoadingButton } from '@/components/ui/button';
import { useSignal } from '@preact/signals';
import { type AgentToolView, updateToolGroup } from '@tkottke90/ai-assistant-client';
import { useEffect } from 'preact/hooks';
import { useCallback } from 'preact/hooks';
import { toast } from 'sonner';


// ── Pure utilities ─────────────────────────────────────────────────────────────

interface DrawerField {
  label: string;
  value: string;
  mono?: boolean;
}

/** Returns the set of read-only display fields for the tool detail drawer. */
export function toolDrawerFields(tool: AgentToolView): DrawerField[] {
  const fields: DrawerField[] = [
    { label: 'Description', value: tool.description },
    { label: 'Namespaced ID', value: tool.id, mono: true },
  ];
  if (tool.mcp_server) {
    fields.push({ label: 'MCP Server', value: tool.mcp_server.config_id });
  }
  if (tool.locked_tier !== null) {
    fields.push({ label: 'Locked Tier', value: String(tool.locked_tier) });
  }
  return fields;
}


// ── Component ──────────────────────────────────────────────────────────────────

interface ToolDrawerProps {
  tool: AgentToolView;
  onClose: () => void;
}

export function ToolDrawer({ tool, onClose }: ToolDrawerProps) {
  const group = useSignal(tool.group ?? '');
  const saving = useSignal(false);
  const drawerTrigger = useSignal(new EventTarget());

  // Auto-open the drawer when this component mounts
  useEffect(() => {
    drawerTrigger.value.dispatchEvent(new Event('open'));
  }, []);

  const handleSave = useCallback(async () => {
    saving.value = true;
    try {
      await updateToolGroup({ id: tool.id, group: group.value.trim() || null });
      toast.success('Group updated');
    } catch {
      toast.error('Failed to update group');
    } finally {
      saving.value = false;
    }
  }, [tool.id]);

  const sourceLabel = getSourceLabel(tool.source, tool.mcp_server, tool.group);
  const badgeClass = sourceBadgeClass(tool.source);
  const fields = toolDrawerFields(tool);

  return (
    <Drawer
      title={tool.name}
      showTrigger={false}
      eventTrigger={drawerTrigger}
      onClose={onClose}
    >
      <div class="flex flex-col gap-4 h-full overflow-y-auto">
        {/* Source badge */}
        <div>
          <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
            {sourceLabel}
          </span>
        </div>

        {/* Read-only fields */}
        {fields.map((f) => (
          <div key={f.label}>
            <p class="text-xs font-semibold uppercase tracking-wide opacity-60 mb-0.5">{f.label}</p>
            <p class={f.mono ? 'font-mono text-sm break-all' : 'text-sm'}>{f.value}</p>
          </div>
        ))}

        {/* Editable group */}
        <div>
          <label class="text-xs font-semibold uppercase tracking-wide opacity-60 block mb-0.5" for="tool-group-input">
            Group
          </label>
          <input
            id="tool-group-input"
            type="text"
            class="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            value={group.value}
            onInput={(e) => { group.value = (e.target as HTMLInputElement).value; }}
            placeholder="e.g. GitHub"
          />
          <p class="text-xs opacity-50 mt-1">
            Clear to remove the group. Note: config-driven groups are re-applied on server restart.
          </p>
        </div>

        {/* Save */}
        <div>
          <LoadingButton loading={saving} onClick={handleSave}>
            Save
          </LoadingButton>
        </div>
      </div>
    </Drawer>
  );
}
