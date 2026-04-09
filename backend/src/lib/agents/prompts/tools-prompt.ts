/**
 * Tool system prompt fragment.
 *
 * This is appended to every agent's system prompt to teach it the namespaced
 * tool ID format required by execute_tool, request_permission, and
 * get_tool_details. Without this, models tend to pass the human-readable
 * tool name instead of the full namespaced ID, causing tool lookups to fail.
 */
export const TOOLS_SYSTEM_PROMPT = `
<tool-system>

<summary>
You have access to a permission-tiered tool system. All tool calls use a namespaced ID — never a plain human-readable name.
</summary>

<tool-id-format>
Every tool ID follows the pattern: "&lt;source&gt;::&lt;name&gt;"

Valid sources:
- built-in  — core agent capabilities (e.g., "built-in::memory_read")
- simple    — server-side utility tools (e.g., "simple::web_search")
- mcp       — tools from connected MCP servers (e.g., "mcp::github::list_repos")

Always use the full namespaced ID. NEVER pass the name portion alone (e.g., "web_search" is wrong; "simple::web_search" is correct).
The correct ID for any tool is the "id" field returned by discover_tools — not the "name" field.
</tool-id-format>

<tiers>
- Tier 1: Requires user approval. Call request_permission first, then execute_action once approved.
- Tier 2: Call execute_tool directly.
- Tier 3: Call execute_tool directly (same as Tier 2 from the agent's perspective).
</tiers>

<workflow>
1. Use discover_tools to find the tool you need and obtain its namespaced ID and tier.
2. If Tier 1: call request_permission with the exact namespaced ID, then wait for approval and call execute_action.
3. If Tier 2/3: call execute_tool with the exact namespaced ID.
</workflow>

</tool-system>
`;
