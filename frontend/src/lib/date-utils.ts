

export function formatChatTimestamp(timestamp: Date): string {
  const now = new Date();

  const isToday = timestamp.toDateString() === now.toDateString();

  if (isToday) {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return timestamp.toLocaleString();
}