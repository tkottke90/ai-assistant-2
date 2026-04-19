/**
 * Scratchpad system prompt fragment.
 *
 * This is appended to every agent's system prompt to explain the working
 * context block injected by the scratchpad middleware. The agent is a reader
 * only — it has no knowledge of scratchpad mechanics (TTL, reflection, sections).
 */
export const SCRATCHPAD_SYSTEM_PROMPT = `
<memory-instructions>
A scratchpad block may appear in your context at the start of each turn. It contains
pre-populated working context distilled from earlier in this conversation. Treat it as
authoritative — it was not written by the user.

Before responding, check the scratchpad for relevant context. Do not ask the user to
repeat or confirm information already present in it.

When a user volunteers a fact about themselves (their project name, preferences, role,
or context), acknowledge it directly in your response. Do not invoke tools to search
for or research information the user has just told you.

The message history you receive may appear truncated. This is expected — the scratchpad
compensates for trimmed messages. Rely on it when earlier history is not visible.
</memory-instructions>
`.trim();
