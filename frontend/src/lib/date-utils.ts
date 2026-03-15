

export function formatChatTimestamp(timestamp: Date): string {
  const now = new Date();

  const isToday = timestamp.toDateString() === now.toDateString();

  if (isToday) {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return timestamp.toLocaleString();
}

/** Formats a date as a short relative string (e.g. "2h ago", "3d ago", "Jan 5"). */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDuration(startMs: number, endMs: number): string {
  const durationParts = { h: 0, m: 0, s: 0 };

  const ms = endMs - startMs;
  if (ms < 1000) return `${ms}ms`;

  durationParts.s = Math.floor(ms / 1000);
  durationParts.m = Math.floor(durationParts.s / 60);
  durationParts.s = durationParts.s % 60;
  durationParts.h = Math.floor(durationParts.m / 60);
  durationParts.m = durationParts.m % 60;

  const parts: string[] = [];
  if (durationParts.h > 0) parts.push(`${durationParts.h}h`);
  if (durationParts.m > 0) parts.push(`${durationParts.m}m`);
  if (durationParts.s > 0 || parts.length === 0) parts.push(`${durationParts.s}s`);

  return parts.join(' ');
}