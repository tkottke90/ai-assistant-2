# Tool Discovery System Design

## Overview

A tool governance system enabling agents to discover, inspect, and request permission to use tools — without having any tool execution access by default.

The core contract is:
- **Discovery and inspection are free and transparent** — agents can always search for and read full details about tools
- **Execution is gated** — no tool runs without an explicit permission grant, approved by the user

---

## Goals

- Tools are inaccessible by default; agents cannot execute anything without user approval
- Agents can discover tools relevant to their current task via semantic/keyword search
- Agents can inspect full tool details (input/output schema, capabilities) before deciding to request permission
- Permission requests are specific and justified, giving users enough context to make an informed approval decision
- The system is auditable — discovery and permission requests are traceable through conversation history and logs
- Permissions are scoped **per-agent** — each agent has its own permission profile that evolves independently
- Trust is progressive — a tool's permission tier for a given agent can be upgraded over time as the agent demonstrates reliable behavior

---

## Non-Goals

- This is not a tool selector that chooses between already-granted tools (that is LangChain's domain)
- This is not a capability system that restricts what tools can be built
- Auto-approval is out of scope for the initial design

---

## Tool Sources

Tools come from three distinct sources. All three are surfaced uniformly through the same registry and tier system.

| Source | Definition | User-manageable tier | Requires release to add |
|--------|-----------|---------------------|------------------------|
| **Built-in** | Compiled into the platform | No — tier is locked | Yes |
| **Simple** | Bundled JS files dropped into `CONFIG_DIR/tools/` | Yes | No |
| **MCP Server** | External process/service exposing tools via MCP protocol | Yes | No |

### Built-in Tools
Compiled into the backend. Includes the four core permission-system tools (`discover_tools`, `get_tool_details`, `request_permission`, `execute_action`), one Tier 2/3 execution helper (`execute_tool`), and core agent utilities like memory tools. Each has a `locked_tier` that cannot be changed by the user. Seeded into the `Tool` table at startup.

### Simple Tools
Self-contained bundled JS files authored in TypeScript and compiled with esbuild. Dropped into `CONFIG_DIR/tools/` and registered in `config.yaml`. Dependencies are bundled into the single output file — no `node_modules` needed at runtime. A `create(config)` factory export receives per-tool config (including secrets) at load time.

**Known limitation**: Tools with native binary dependencies (`.node` files) cannot be bundled and are not supported.

**Tool author workflow**:
```bash
# 1. Write tool in TypeScript with create(config) factory export
# 2. Bundle with esbuild (all dependencies inlined)
esbuild src/my-tool.ts --bundle --platform=node --outfile=my-tool.js
# 3. Drop into config tools directory
cp my-tool.js $CONFIG_DIR/tools/
# 4. Register in config.yaml and restart app
```

**Tool implementation contract**:
```typescript
import { tool } from "@langchain/core/tools"
import { z } from "zod"

export default function create(config: Record<string, unknown>) {
  return tool(
    async ({ query }) => { /* implementation */ },
    {
      name: "web_search",
      description: "Searches the web for current information",
      schema: z.object({ query: z.string() })
    }
  )
}
```

### MCP Servers
External processes or HTTP services that expose tools via the [Model Context Protocol](https://modelcontextprotocol.io). **Defined in `config.yaml`** alongside simple tools — no release required to add a new server. Connected at startup; tools discovered via `tools/list` and upserted into the `Tool` table automatically. Runtime state (connection status, errors) is held in memory only — never persisted — so a restart always begins from a clean `connecting` state.

---

## Permission Tiers

Each tool assigned to an agent carries a tier that controls both visibility and execution access. Tiers are **per-agent** — the same tool can have different tiers for different agents.

| Tier | Name | Appears in `discover_tools` | Execute Without Permission |
|------|------|----------------------------|----------------------------|
| **1** | No Permission (Default) | Only if search query matches | Never — always requires a grant |
| **2** | Read-Only Permission | Always — injected regardless of query | Yes — for this read/non-mutating tool |
| **3** | Full Permission | Always — injected regardless of query | Yes — unconditionally |

**Key design decisions:**
- Each tool has a single purpose (e.g. `file_system_read`, `file_system_write` are separate tools). The read/write boundary is at the tool level, not the operation level. Tier assignment *is* the read/write boundary.
- **System prompt contains only core built-in tools** (memory, discovery tools, etc.) defined in application code, not configurable. This keeps context window lean.
- **All tools are discovered via `discover_tools` call** — no automatic pre-population. The agent must actively search.
- **Tier 2/3 visibility difference**: These tools always appear in `discover_tools` results even if the query doesn't match. Tier 1 tools appear only on keyword match. This makes high-trust tools more discoverable without polluting the system prompt.

### Progressive Trust

Tiers are a **trust level that evolves**. As a tool matures and the agent demonstrates reliable behavior (aided by accumulated memory notes on correct usage), the user can upgrade the tier:

```
file_system_write assigned to Agent A:
  Initial:  Tier 1 — agent must request permission every time
  Later:    Tier 1 — still gated, but agent memory has notes on correct usage patterns
  Mature:   Tier 3 — full trust established, no friction
```

Upgrading or downgrading a tier is a deliberate user action via the agent's Tools settings. Changes take effect immediately for all future executions. Any in-flight executions at the time of a downgrade are unaffected — they complete normally.

**Default tier**: When a user adds a tool to an agent it always starts at Tier 1. Promotion to Tier 2 or 3 is always an explicit user decision.

---

## Three-Stage Interaction Model

The flow varies by tier. Tier 1 always requires all three stages. Tier 2/3 tools skip to execution directly.

```
Stage 1: Search
  Agent calls discover_tools(query)
  → Tier 2/3 tools always appear in results
  → Tier 1 tools appear only if the search query matches
  → Returns lightweight ToolSummary list (name, description, danger_level, tier)

Stage 2: Inspect
  Agent calls get_tool_details(tool_id)
  → Returns full ToolManifest (input schema, output shape, capabilities, parameters)
  → Agent uses this to determine if the tool is appropriate and to form a specific permission request

Stage 3: Execute
  Tier 2/3: Agent calls execute_tool(tool_id, params) directly — no grant needed

  Tier 1:   Agent calls request_permission(tool_id, description, action)
            → Creates a pending AgentAction record visible to the user
            → Agent suspends until user resolves the request
            User approves → Agent calls execute_action(action_id)
            → Description fed back to agent to restore context
            → Tool executes and returns ToolResult
```

---

## Built-in Agent Tools

Five built-in tools are always injected into every agent: four permission-system tools (below) and one execution convenience tool (`execute_tool`). The first two permission-system tools require no permissions; the last two are gated.

```
discover_tools(query: str) -> list[ToolSummary]
  Always available. Searches the registry using the agent's natural language query.
  Tier 2/3 tools always appear; Tier 1 tools appear only on match.
  Returns lightweight summaries only.

get_tool_details(tool_id: str) -> ToolManifest
  Always available. Returns the full manifest for a specific tool.
  Explicit signal of intent — logged for auditability.

request_permission(tool_id: str, description: str, action: ToolCallBatch) -> AgentAction
  Tier 1 tools only. Creates a pending AgentAction record visible to the user.
  description: agent-authored goal statement — shown to user during review,
               fed back to agent at execution time to restore context if approval was delayed.
  action: batch of tool calls to execute on approval (v1: always a single-item batch).
  Agent suspends until the request is resolved or expires.

execute_action(action_id: str) -> ToolResult[]
  Tier 1: executes an approved AgentAction by ID. Fails if status is not Approved.
  The AgentAction description is returned alongside results to re-anchor agent context.
```

**Convenience execution tool** — injected alongside the four core tools but not part of the permission system. Requires the target tool to already have Tier 2 or 3 assigned to the agent.

```
execute_tool(tool_id: str, params: dict) -> ToolResult
  Tier 2/3 only: executes directly without a permission request.
  Fails immediately if the agent's effective tier for the tool is Tier 1.
```

---

## Data Models

### ToolSummary
Returned by `discover_tools`. Lightweight — enough for the agent to decide if a tool is worth inspecting.

```typescript
{
  id: string
  name: string
  description: string                    // One-line summary
  danger_level: "low" | "medium" | "high"
  tier: 1 | 2 | 3                        // Agent's current permission tier for this tool
}
```

### ToolManifest
Returned by `get_tool_details`. Full details for agent decision-making and permission request authoring.

```typescript
{
  id: string
  name: string
  description: string                    // Full description
  capabilities: string[]                 // e.g. ["external_network", "read_only", "file_system"]
  danger_level: "low" | "medium" | "high"
  tier: 1 | 2 | 3                        // Agent's current permission tier for this tool
  input_schema: JSONSchema               // What parameters execute_tool expects
  output_schema: JSONSchema              // What the tool returns
}
```

### Tool
A registered tool in the system. All three sources (built-in, simple, MCP) are stored as `Tool` records, providing a unified registry.

```typescript
{
  tool_id: number                        // Internal DB PK
  id: string                             // Namespaced stable identifier
                                         //   "built-in::memory_read"
                                         //   "simple::web_search"
                                         //   "mcp::brave-server::web_search"
  name: string
  description: string
  source: "built-in" | "simple" | "mcp"
  mcp_server_id: number | null           // Set for MCP tools only
  locked_tier: 1 | 2 | 3 | null         // Set for built-in tools — user cannot override
  input_schema: JSONSchema
  output_schema: JSONSchema | null
  created_at: DateTime
  updated_at: DateTime
}
```

### McpServer
A minimal DB record whose only purpose is providing a stable PK for the `Tool` table's foreign key. The server's definition (transport, command, args, secrets) lives in `config.yaml`. Runtime state lives in memory only.

```typescript
// DB record — stable identity only
{
  server_id: number   // Internal PK referenced by Tool.mcp_server_id
  config_id: string   // Matches id in config.yaml — join key between config and DB
}

// In-memory state — held by McpServerManager, never persisted
{
  config_id: string
  status: "connecting" | "connected" | "error" | "disconnected"
  client: McpClient | null
  last_error: string | null
  connected_at: Date | null
}
```

On every startup all servers begin as `"connecting"` regardless of prior state. Status is read from `app.tools.mcp.getStatus(configId)` — never from the DB.

### AgentTool
The per-agent assignment of a tool and its tier. Replaces the earlier `AgentPermissionProfile` concept. Has a proper FK to `Tool`.

```typescript
{
  id: number
  agent_id: number
  tool_id: number                        // FK to Tool
  tier: 1 | 2 | 3                        // Ignored if tool.locked_tier is set
  created_at: DateTime
  updated_at: DateTime
}
```

**Effective tier**: Always resolved as `tool.locked_tier ?? agentTool.tier`. The UI hides the tier selector and shows a "System Tool" badge when `locked_tier` is set.

### ToolCallBatch
The payload passed to `request_permission` and stored in `AgentAction.action`. In v1 always a single-item array. Typed as a plain object matching the target tool's Zod input schema — identical to what LangChain passes to the tool handler.

```typescript
type ToolCall = {
  tool_id: string                    // Namespaced tool identifier, e.g. "simple::web_search"
  params: Record<string, unknown>    // Matches the tool's Zod input schema
}

type ToolCallBatch = ToolCall[]      // v1: always single-item
```

`action_hash` is computed as `MD5(JSON.stringify(batch, null, 0))` with object keys sorted alphabetically at each level, ensuring a stable hash regardless of key insertion order.

### AgentAction
The central record for all Tier 1 permission requests. Created when an agent calls `request_permission`. Replaces the separate `PermissionRequest` + `PermissionGrant` concepts — an approved `AgentAction` *is* the authorization to execute.

```typescript
{
  action_id: number                  // Internal DB PK
  id: string                         // UUID — stable public identifier returned to agent
  agent_id: number
  thread_id: string                  // LangGraph thread the request originated from
  user_turn_checkpoint_id: string    // Denormalized ref to LangGraph checkpoints table
  description: string                // Agent-authored goal statement:
                                     //   shown to user during approval review
                                     //   fed back to agent at execute_action time to restore context
  action: ToolCallBatch              // Array of tool calls (v1: always single-item)
  action_hash: string                // MD5 of canonical JSON serialization — tamper detection
  status: "Pending" | "Approved" | "Denied" | "InProgress" | "Completed"
  justification: string | null       // User or system explanation for approval/denial
  auto_approved: boolean             // True if approved automatically via agent's tier
  expires_at: DateTime               // After this, Pending → auto-denied on next read
  created_at: DateTime
  updated_at: DateTime
}
```

**Denial behavior**: A denial means "not this time" — scoped by `(thread_id, agent_id, tool_id, user_turn_checkpoint_id)`. The agent may re-request in a future user turn (new `checkpoint_id`) but is blocked within the same turn. Multiple agents in the same thread are unaffected by each other's denials.

**Expiry enforcement**: Handled passively by the DAO — on any read, if `status === "Pending"` and `expires_at < now()`, the record is updated to `status: "Denied"`, `justification: "Request expired"` before being returned. No background job required.

**`action_hash`**: See `ToolCallBatch` above for the hashing contract.

---

## Discovery Search Strategy

`discover_tools` uses a two-pass search to balance speed and quality:

1. **Keyword/tag match** (fast, free) — match query against tool names, tags, and capability labels
2. **Semantic search fallback** — if keyword results are below a threshold, run an embedding similarity search against tool descriptions

This keeps the common case cheap and deterministic while handling vague or abstract queries gracefully.

The result set is capped at a small N (e.g. 5) to avoid flooding the agent context.

---

## Permission Flow Examples

### Tier 1 — Agent discovers, requests permission, and executes on approval

```
Agent: "The user wants current AAPL stock price. I need real-time data."
  → discover_tools("real-time financial data web search")
  ← [{ id: "web_search", name: "Web Search", danger_level: "medium", tier: 1 }]

Agent: → get_tool_details("web_search")
  ← Full ToolManifest with input/output schema

Agent: → request_permission(
            "web_search",
            description="Searching for current AAPL stock price to answer the user's
                         portfolio question. Result will be used to calculate total holdings value.",
            action=[{ tool: "web_search", params: { query: "AAPL stock price" } }]
          )
  ← AgentAction { id: "action-abc-123", status: "Pending" }
  [Agent suspends]

User sees:
  ┌─────────────────────────────────────────────────────┐
  │ web_search  [Pending]                               │
  │                                                     │
  │ "Searching for current AAPL stock price to answer   │
  │  the user's portfolio question. Result will be used │
  │  to calculate total holdings value."                │
  │                                                     │
  │                          [Deny]  [Approve]          │
  └─────────────────────────────────────────────────────┘

User: → approves

AgentAction status updated to "Approved" via API

Controller emits internal `action_resolved` event → AgentManager resumes suspended graph → execute_action("action-abc-123")
  ← {
      description: "Searching for current AAPL stock price...",  // context restored
      results: [ToolResult { data: "..." }]
    }

Agent resume prompt includes description to re-anchor context:
  "You previously requested to use web_search. Your stated goal was: [description].
   You are now approved. Here are the results: [...]"
```

### Agent Notification Flow & Suspension Model

When an agent calls `request_permission`, it signals the LangGraph loop to exit gracefully via `jump_to`. The agent is no longer executing — it is suspended, waiting for user action via pub-sub events.

**Agent Suspension via `jump_to`**:

```typescript
// Inside request_permission tool implementation
const agentAction = await createAgentAction(...)  // Write to DB, status: "Pending"

// Signal LangGraph to exit the loop
// The agent graph calls jump_to("end") or similar to stop execution
// No more steps are processed until resumed
return {
  action_id: agentAction.id,
  status: "pending",
  interrupt_type: "permission_request"
}
```

The agent loop pauses. Control returns to `AgentRuntime`, which subscribes to the pub-sub event channel for this agent.

**Handling New User Input During Suspension**:

If the user sends a new message while an `AgentAction` is still `Pending`, the `AgentRuntime` detects this and must make a choice:

1. **Continue Waiting**: Ignore the new message. Stay suspended. Keep waiting for the pending request to be resolved.
2. **Abort Request**: Cancel the pending `AgentAction` (update status → `"Denied"`, justification: `"Agent aborted"`), exit suspension, and process the new user message.

The agent decides which path to take. This decision is typically based on:
- Whether the new message is related to the pending request (continue waiting) or a new topic (abort and pivot)
- Agent memory and context understanding

**No message buffering**: Messages do not queue. The agent either waits or aborts and moves forward with the new input.

**Resume Flow**:

1. **API call**: `PATCH /api/v1/tools/actions/:id` updates `AgentAction.status` to `Approved` or `Denied`. Controller records any `justification`.

2. **Event emission**: Controller emits an internal event targeted at the specific agent:
   ```typescript
   app.pubsub.emit(`action:${agentName}:${actionId}:${status}`, { agentAction })
   ```
   Example: `app.pubsub.emit('action:research-agent:action-abc-123:approved', { agentAction: {...} })`

3. **Agent subscription**: While suspended, `AgentRuntime` listens on its action channel:
   ```typescript
   app.pubsub.on(`action:${agentName}:*`, (event) => {
     const [, , actionId, status] = event.split(':')
     if (actionId === waitingActionId && (status === 'approved' || status === 'denied')) {
       resumeExecution(actionId, status)
     }
   })
   ```

4. **Resume execution**: On receiving the event, call `execute_action(action_id)`. The tool returns both the original `description` (to restore context) and the `ToolResult[]`. The agent graph resumes from where it paused.

5. **Full denial**: If `status === "Denied"`, `execute_action` returns an error. The agent must inform the user that it cannot complete the task without the tool.

**Event pattern**: `action:<agent_name>:<action_id>:<status>`
- `agent_name`: The agent's name (from `Agent.name`)
- `action_id`: The UUID of the `AgentAction` record
- `status`: Either `"approved"` or `"denied"`

**Advantages**:
- LangGraph control flow: `request_permission` uses native `jump_to` to exit the loop cleanly, no polling
- Agent-specific targeting: Only the relevant agent is notified via pub-sub
- Multi-agent friendly: Each agent listens to its own events independently
- No external infrastructure required: Works with in-process pub-sub

```
Sequence: Agent exits loop via jump_to after calling request_permission
  ↓ request_permission returns with interrupt_type
  ↓ LangGraph calls jump_to("end") — agent loop pauses
  ↓ AgentRuntime subscribes to action:${agentName}:* events
  
  ↓ [User approves in UI]         → PATCH /api/v1/tools/actions/:id { status: "Approved" }
  ↓ [Pub-sub event emitted]        → app.pubsub.emit('action:research-agent:action-abc-123:approved', {...})
  ↓ [AgentRuntime receives event]  → resumes from suspension
  ↓ [execute_action called]        → { description: "...", results: [...] }
  ↓ [Graph resumes execution]      → agent continues with tool results
```

Alternatively, if user sends a new message while suspended:

```
Sequence: Agent suspended, new message arrives
  ↓ [User sends new message]
  ↓ [AgentRuntime detects pending AgentAction]
  ↓ [Agent decides: continue waiting OR abort]
  
  If continue waiting:
    Ignore new message, stay suspended
  
  If abort:
    ↓ Update pending AgentAction status → "Denied" (justification: "Agent aborted")
    ↓ Unsubscribe from pub-sub
    ↓ Resume from suspension with new message as input
    ↓ Graph resumes and processes new user message
```

### Tier 1 — Denial within same user turn

```
User: → denies

AgentAction { status: "Denied", justification: "Not now" }

Agent: → request_permission("web_search", ...)   // tries again, same user turn
  ← Error: "Permission denied for web_search in this turn. Try again in a new message."
  [Agent must inform user it cannot complete the task without the tool]
```

### Tier 2/3 — Agent executes directly (no permission request)

```
Agent: "I need to read the project README."
  → discover_tools("file system read")  // must actively search
  ← [{ id: "file_system_read", name: "...", tier: 2 }, ...]  // appears in results (tier 2)

Agent: → execute_tool("file_system_read", { path: "./README.md" })
  ← ToolResult { data: "..." }
```

---

## Error Handling & Edge Cases

### MCP Server Disconnection

When an MCP server is disconnected and the agent attempts to execute one of its tools via `execute_tool` or `execute_action`:

1. `execute_tool` fails immediately with an error: `"Tool unavailable: <tool_id>. MCP server <server_id> is currently disconnected."`
2. The agent receives the error and must inform the user that the task cannot be completed
3. The `Tool` record remains in the database but is logically unavailable until the server reconnects

`discover_tools` gracefully excludes tools from disconnected servers from its results — they do not appear even if the agent searches for them.

### Invalid Action Status on Execute

`execute_action` validates the `AgentAction` status before execution:

```typescript
// Valid: can execute
if (action.status === "Approved") { ... }

// Invalid: reject the call
if (action.status === "InProgress" || "Completed" || "Denied" || "Pending") {
  throw new Error(`Cannot execute action with status: ${action.status}`)
}
```

This prevents duplicate execution and guards against race conditions where two concurrent requests might try to execute the same action.

### Multiple Agents Requesting Same Tool in Same Turn

If two agents in the same thread both request permission for the same tool within the same user turn (same `user_turn_checkpoint_id`):

- **Two separate `AgentAction` records are created** — one per agent
- Both are visible to the user in the approval queue
- Each agent's denial scope is independent: `(thread_id, agent_id, tool_id, user_turn_checkpoint_id)`
- Denying one agent's request does not affect the other agent's request
- The user can approve/deny each request independently

Example:

```
User: "Get the weather and sports news"

Agent A: → request_permission("web_search", "Get weather...", ...)
         ← AgentAction { id: "action-a", agent_id: 42, status: "Pending" }

Agent B: → request_permission("web_search", "Get sports news...", ...)
         ← AgentAction { id: "action-b", agent_id: 43, status: "Pending" }

User sees two separate requests in the queue, can approve/deny each independently
```

---

## Integration with LangChain

The two systems are complementary and operate at different layers:

```
Tool Discovery & Permission System (this design)
  ↓ permission granted
LangChain Tool Calling (mechanics of invocation)
  ↓
Tool Execution
```

LangChain handles how tools are called and their results parsed. This system handles whether they can be called at all.

### Checkpoint System

This system uses LangChain's `SqliteSaver` checkpointer (already configured in `database.ts`) for short-term memory. Each LangChain graph step creates a new checkpoint snapshot of the thread's state. Multiple checkpoints are created within a single user turn as the agent reasons through steps.

For permission denial purposes, the relevant boundary is the **user turn checkpoint** — the checkpoint where a `HumanMessage` was added to the graph. All agent reasoning steps within that user turn share this boundary.

```
Thread: "thread_abc"
├── checkpoint: "cp_1"  HumanMessage: "What's AAPL?"   ← user_turn_checkpoint_id
├── checkpoint: "cp_2"  Agent: calls discover_tools
├── checkpoint: "cp_3"  Agent: calls request_permission("web_search")
│                         AgentAction { user_turn_checkpoint_id: "cp_1", status: "Denied" }
├── checkpoint: "cp_4"  Agent: tries request_permission("web_search") again
│                         → BLOCKED: same user_turn_checkpoint_id "cp_1"
│
├── checkpoint: "cp_5"  HumanMessage: "Try again please"  ← new user_turn_checkpoint_id
├── checkpoint: "cp_6"  Agent: calls request_permission("web_search")
│                         → ALLOWED: new user_turn_checkpoint_id "cp_5"
```

**Resolving `user_turn_checkpoint_id`**: Since `checkpointer.list()` returns checkpoints newest-first, the first checkpoint found containing a `HumanMessage` in `channel_values['messages']` is always the current user turn:

```typescript
async function getUserTurnCheckpointId(threadId: string): Promise<string> {
  const historyGen = checkpointer.list({ configurable: { thread_id: threadId } });
  for await (const item of historyGen) {
    const messages = item.checkpoint.channel_values['messages'] as BaseMessage[];
    if (messages?.some(m => m._getType() === 'human')) {
      return item.checkpoint.id;
    }
  }
  // Edge case: No human message in thread yet (e.g., multi-agent auto-start scenario)
  // Fallback to thread_id as coarse turn boundary to maintain scoping semantics
  // This ensures denial blocking works correctly and is semantically sound
  return threadId;
}
```

The fallback to `thread_id` is safe because:
- It maintains the denial scope contract: `(thread_id, agent_id, tool_id, user_turn_checkpoint_id)`
- Two agents in the same thread will share the same fallback boundary, ensuring denials block both correctly
- Once any HumanMessage appears, the function returns the precise checkpoint and semantics are restored

---

## Tool Loading

`ToolManager` (at `app.tools`) is initialized at startup before `AgentManager`, since agents depend on tools. It follows the same service pattern as `app.llm` and `app.agents`.

```
Startup order:
  config → logger → llm → tools → agents → controllers
```

```typescript
// ToolManager.init() sequence
await this.loadBuiltinTools()   // Upsert built-in Tool records, locked_tier set
await this.loadSimpleTools()    // Read config.tools.simple[], dynamic import, upsert Tool records
await this.loadMcpTools()       // Connect McpServers, call tools/list, upsert Tool records
```

**AgentRuntime integration**: When an `AgentRuntime` starts, it calls `app.tools.getToolsForAgent(agentId)` to get the agent's assigned `AgentTool` records resolved to executable LangChain tools. The five built-in tools (four permission-system tools + `execute_tool`) are always injected regardless of `AgentTool` assignments.

```typescript
const tools = await app.tools.getToolsForAgent(agentId)
const builtins = app.tools.getBuiltinTools()  // always included
const agent = createReactAgent({ llm, tools: [...builtins, ...tools] })
```

**Validation at load time**: `ToolManager` validates each loaded simple tool exports a `default` function returning a LangChain tool. Invalid tools are logged and skipped — they do not crash startup.

**MCP reconnection**: `McpServerManager` (owned by `ToolManager`) handles reconnection and health checks for connected servers. If a server disconnects, its tools remain in the `Tool` table but are marked unavailable until the server reconnects.

**Graceful Failure Handling**:

The goal is **zero startup failures due to tool load issues**. If a tool fails to load, the system logs the error and moves on. The agent can continue operating with the remaining tools.

**Simple Tool Failures**:

When loading a simple tool from `config.tools.simple[]`:

1. **File not found**: Log error, skip tool. The tool does not appear in the registry.
   ```
   Error: Simple tool "web_search" — file not found at CONFIG_DIR/tools/web-search.js. Skipping.
   ```

2. **Invalid module**: Log error, skip tool. If the bundled JS file is malformed or missing `default` export:
   ```
   Error: Simple tool "web_search" — invalid module (missing default export). Skipping.
   ```

3. **Factory error**: Log error, skip tool. If the `create(config)` factory throws:
   ```
   Error: Simple tool "web_search" — create() failed: ${error.message}. Skipping.
   ```

The tool record is **not** upserted into the database. Discovery will not find it. Agents cannot request access to it.

**MCP Server Failures**:

When connecting to an MCP server from `config.tools.mcp_servers[]`:

1. **Connection timeout**: Log error, mark server status as `"error"`. Continue startup. Server tries to reconnect at intervals.
   ```
   Error: MCP server "brave-search" — connection timeout after 5s. Will retry.
   ```

2. **Handshake failure**: Log error, mark server status as `"error"`. Continue startup.
   ```
   Error: MCP server "brave-search" — protocol handshake failed: ${error.message}. Will retry.
   ```

3. **tools/list call fails**: Log error, mark server status as `"error"`. No tools from this server are upserted into the database.
   ```
   Error: MCP server "brave-search" — tools/list call failed: ${error.message}. Will retry.
   ```

The **MCP server DB record is created** (for FK purposes), but its tools are not available until the server successfully connects and returns a tool list.

**Retry Strategy for MCP Servers**:

- Initial connection attempts happen at startup with a reasonable timeout (e.g., 5 seconds per server)
- If a server fails to connect at startup, it is marked as "error" but the system continues to run
- Periodic health checks (e.g., every 30 seconds) attempt to reconnect
- If a previously connected server disconnects, reconnection retries are triggered

This allows transient startup failures (server not yet running) to recover without user intervention.

**User Visibility**:

- All load errors are logged as part of the tool startup sequence, visible in the main application logs
- Users can view MCP server status via `GET /api/v1/tools/mcp/status` to see which servers are `"error"` or `"connecting"`
- The UI shows unavailable servers in the agent settings (MCP Servers tab)
- Agents calling `discover_tools` will never see tools from unavailable servers

---

## Configuration

Managed via the existing `ConfigManager` pattern. Simple tools are registered in config; MCP servers and per-agent tier assignments are managed via UI and stored in the database.

```yaml
tools:
  # Simple tools to load from CONFIG_DIR/tools/
  # Built-in tools are always loaded; MCP tools are defined under mcp_servers below
  simple:
    - id: web_search
      name: "Web Search"
      description: "Searches the web for current information"
      # Path relative to CONFIG_DIR
      path: "tools/web-search.js"
      # Runtime environment to execute the tool in. Defaults to "node". Future: "python", "bash"
      runtime: node
      config:
        api_key: "${BRAVE_API_KEY}"   # env var interpolation
        max_results: 10

  # MCP servers to connect at startup
  # Tools are discovered automatically via tools/list on each connection
  mcp_servers:
    - id: brave-search
      name: "Brave Search"
      transport: stdio
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-brave-search"]
      env:
        BRAVE_API_KEY: "${BRAVE_API_KEY}"
    - id: filesystem
      name: "Filesystem"
      transport: http
      url: "http://localhost:3001"

  # How long (seconds) a Pending AgentAction can remain unresolved before auto-denial on next read
  permission_request_ttl_seconds: 900  # 15 minutes

  # Maximum tools returned by discover_tools
  discovery_max_results: 5

  # Search strategy thresholds
  discovery_keyword_min_results: 2   # Fall back to semantic if fewer than this
```

Per-agent tier assignments are managed through the agent settings UI (Tools tab) and persisted in the database via `AgentTool`.

### Zod Schema

```typescript
// backend/src/lib/config/tools.schema.ts

import { z } from 'zod'

const SimpleToolConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  path: z.string().min(1),
  runtime: z.enum(['node']).default('node'),  // Extensible for future runtimes
  config: z.record(z.unknown()).optional().default({}),
})

const McpServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),           // For stdio transport
  args: z.array(z.string()).optional(),     // For stdio transport
  url: z.string().url().optional(),         // For http transport
  env: z.record(z.string()).optional().default({}),
})

export const ToolsConfigSchema = z.object({
  simple: z.array(SimpleToolConfigSchema).optional().default([]),
  mcp_servers: z.array(McpServerConfigSchema).optional().default([]),
  permission_request_ttl_seconds: z.number().int().positive().default(900),
  discovery_max_results: z.number().int().positive().default(5),
  discovery_keyword_min_results: z.number().int().positive().default(2),
})

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>
export type SimpleToolConfig = z.infer<typeof SimpleToolConfigSchema>
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>
```

**Defaults ensure zero-config operation**: Every field in `ToolsConfigSchema` has a sensible default. If a `tools:` section is omitted entirely from `config.yaml`, the system initializes with:
- `simple: []` — no simple tools loaded
- `mcp_servers: []` — no MCP servers connected
- `permission_request_ttl_seconds: 900` (15 minutes)
- `discovery_max_results: 5`
- `discovery_keyword_min_results: 2`

This ensures new installs and upgrades never break due to missing config. The only built-in tools always available, and users can add simple tools or MCP servers incrementally.

### Environment Variable Interpolation

Configuration values can reference environment variables using the pattern `${VAR_NAME}`. This is especially useful for secrets (API keys, passwords) that should not be committed to version control alongside the `config.yaml` file.

**How it works**:

The `ConfigManager` recursively walks the entire loaded config object and replaces all occurrences of `${VAR_NAME}` with the value of `process.env.VAR_NAME`. This applies to every config section — not just tools.

```yaml
# config.yaml example
tools:
  simple:
    - id: web_search
      config:
        api_key: "${BRAVE_API_KEY}"        # Replaced with process.env.BRAVE_API_KEY
        max_results: 10
  
  mcp_servers:
    - id: brave-search
      env:
        BRAVE_API_KEY: "${BRAVE_API_KEY}"  # Replaced with process.env.BRAVE_API_KEY
        
llm:
  apis:
    - alias: openai
      api_key: "${OPENAI_API_KEY}"         # Replaced with process.env.OPENAI_API_KEY
```

**Error handling**:

If an environment variable is referenced but not set in `process.env`:

1. A warning is logged: `"Config warning: environment variable ${VAR_NAME} not found, using empty string"`
2. The placeholder is replaced with an empty string `""`
3. Startup continues

This allows graceful degradation — a missing optional secret doesn't crash startup, but a required secret will typically fail at tool initialization time when validation occurs (e.g., tool auth fails).

**Implementation**:

```typescript
// backend/src/lib/config.ts — within ConfigManager class

private interpolateEnvVars(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    // Leaf value: if it's a string, try interpolation
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
        const value = process.env[varName];
        if (value === undefined) {
          this.logger.warn(
            `Config warning: environment variable ${varName} not found, using empty string`
          );
          return '';
        }
        return value;
      });
    }
    return obj;
  }

  // Recurse into arrays
  if (Array.isArray(obj)) {
    return obj.map(item => this.interpolateEnvVars(item));
  }

  // Recurse into objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = this.interpolateEnvVars(value);
  }
  return result;
}

// Call during config load:
// loadedConfig = this.interpolateEnvVars(loadedConfig);
```

**Limitations (v1)**:

- Only supports basic pattern `${VAR_NAME}`. No defaults (e.g., `${VAR:-default}`) or nesting in v1.
- Regex pattern matches uppercase variable names: `[A-Z_][A-Z0-9_]*`. Lowercase env vars are not interpolated.
- Applied after YAML parsing, before Zod validation. Any interpolation errors (missing vars) result in empty strings, not validation rejections.

---

## API Endpoints

All endpoints are versioned under `/api/v1/tools`.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/tools/search` | Agent discovery. Accepts `{ query: string, agent_id: number }`. Returns `ToolSummary[]`. |
| `GET` | `/api/v1/tools/:id` | Agent inspection. Returns full `ToolManifest` for a tool. |
| `POST` | `/api/v1/tools/actions` | Create permission request. Accepts `{ agent_id, thread_id, description, action }`. Returns `AgentAction` with `status: "Pending"`. |
| `GET` | `/api/v1/tools/actions/:id` | Poll action status. Agent calls while suspended. Returns full `AgentAction`. Auto-expires stale pending records. |
| `PATCH` | `/api/v1/tools/actions/:id` | Approve/deny action. Accepts `{ status: "Approved" \| "Denied", justification?: string }`. Triggers notification to waiting agent. |
| `POST` | `/api/v1/tools/actions/:id/execute` | Execute approved action. Accepts `{}`. Returns `{ description, results: ToolResult[] }`. Fails if status is not `Approved`. |
| `GET` | `/api/v1/tools/mcp/status` | MCP server health. Returns `{ [config_id]: "connecting" \| "connected" \| "error" \| "disconnected" }`. |

---

## Proposed File Structure

```
backend/src/lib/tools/
├── manager.ts           # ToolManager — app.tools service, init + runtime API
├── registry.ts          # Tool DB read/search — used by manager and built-in tools
├── executor.ts          # Tier-aware execution (resolves effective tier from AgentTool)
├── checkpoint.ts        # getUserTurnCheckpointId utility
├── models.ts            # ToolSummary, ToolManifest, Tool, McpServer, AgentTool, AgentAction types
├── search.ts            # Keyword + semantic search logic
├── builtin/             # Built-in tool implementations (always loaded, locked_tier)
│   ├── index.ts         # Seeds built-in Tool records at startup
│   ├── discover-tools.ts
│   ├── get-tool-details.ts
│   ├── request-permission.ts
│   ├── execute-action.ts
│   └── execute-tool.ts
├── simple/
│   └── loader.ts        # Reads config.tools.simple[], dynamic import, validates contract
└── mcp/
    ├── manager.ts       # McpServerManager — connect, reconnect, health checks
    ├── client.ts        # MCP protocol client (stdio + http transports)
    └── discovery.ts     # Calls tools/list, upserts Tool records into DB

backend/src/lib/dao/agent-action.dao.ts   # AgentAction CRUD — handles expiry enforcement on read
backend/src/lib/dao/agent-tool.dao.ts     # AgentTool CRUD — tier assignments per agent
backend/src/lib/dao/tool.dao.ts           # Tool + McpServer (DB record only) CRUD
backend/src/controllers/v1/tools.ts       # API: registry, action queue, tier management, MCP status
backend/prisma/schema.prisma              # Tool, McpServer, AgentTool, AgentAction tables

config/
└── tools/                               # Simple tool bundles (user-managed)
    └── web-search.js                    # esbuild output — fully self-contained
```

The four core permission-system tools (`discover_tools`, `get_tool_details`, `request_permission`, `execute_action`) plus the `execute_tool` convenience helper are always injected into every agent regardless of `AgentTool` assignments. The four core tools form the permission system interface; `execute_tool` is an execution shorthand that requires an already-granted Tier 2/3 on the target tool.

### Prisma Schema

```prisma
// Updated Agent model — adds reverse relations for AgentTool and AgentAction.
model Agent {
  agent_id      Int      @id @default(autoincrement())
  name          String
  description   String?
  version       Int      @default(1)
  system_prompt String
  auto_start    Boolean  @default(false)
  engine        String?
  model         String?
  created_at    DateTime @default(now())
  updated_at    DateTime @default(now()) @updatedAt

  agent_tools AgentTool[]
  actions     AgentAction[]

  @@unique([name, version])
  @@index([created_at])
  @@index([updated_at])
}

// Minimal record — stable PK for Tool.mcp_server_id FK only.
// Server definition lives in config.yaml; runtime state lives in McpServerManager memory.
model McpServer {
  server_id Int    @id @default(autoincrement())
  // Matches id in config.yaml — join key between config and DB
  config_id String @unique

  tools Tool[]
}

model Tool {
  tool_id       Int        @id @default(autoincrement())
  // Namespaced: "built-in::memory_read", "simple::web_search", "mcp::server::tool"
  id            String     @unique
  name          String
  description   String
  // "built-in" | "simple" | "mcp"
  source        String
  mcp_server_id Int?
  // Set for built-in tools — user cannot override via AgentTool.tier
  locked_tier   Int?
  input_schema  Json
  output_schema Json?
  created_at    DateTime   @default(now())
  updated_at    DateTime   @default(now()) @updatedAt

  mcp_server  McpServer?  @relation(fields: [mcp_server_id], references: [server_id])
  agent_tools AgentTool[]

  @@index([source])
  @@index([mcp_server_id])
}

model AgentTool {
  id         Int      @id @default(autoincrement())
  agent_id   Int
  tool_id    Int
  // Effective tier = tool.locked_tier ?? this field
  tier       Int      @default(1)
  created_at DateTime @default(now())
  updated_at DateTime @default(now()) @updatedAt

  agent Agent @relation(fields: [agent_id], references: [agent_id], onDelete: Cascade)
  tool  Tool  @relation(fields: [tool_id], references: [tool_id], onDelete: Cascade)

  @@unique([agent_id, tool_id])
  @@index([agent_id])
  @@index([tool_id])
}

model AgentAction {
  action_id     Int      @id @default(autoincrement())
  id            String   @default(uuid())
  agent_id      Int
  thread_id     String
  // Denormalized ref to LangGraph checkpoints table — no FK, LangGraph owns that table
  user_turn_checkpoint_id String
  // Agent-authored goal statement: shown to user during review,
  // fed back to agent at execute_action time to restore context
  description   String
  // Batch of tool calls — v1 always single-item
  action        Json
  // MD5 of canonical JSON serialization — tamper detection
  action_hash   String
  // Pending | Approved | Denied | InProgress | Completed
  status        String   @default("Pending")
  justification String?
  auto_approved Boolean  @default(false)
  // system-wide TTL from tools.permission_request_ttl_seconds config
  expires_at    DateTime
  created_at    DateTime @default(now())
  updated_at    DateTime @default(now()) @updatedAt

  agent Agent @relation(fields: [agent_id], references: [agent_id], onDelete: Cascade)

  @@index([user_turn_checkpoint_id])
  @@index([id])
  @@index([thread_id])
  @@index([thread_id, agent_id])
  @@index([status])
  @@index([expires_at])
}
```

### UI — Agent Tools Tab

The agent settings UI exposes the `AgentTool` assignments as a tool list with tier controls. Built-in tools (where `locked_tier` is set) show a "System Tool" badge and the tier selector is disabled. MCP tool source badges include the server name.

MCP server connection status is read from `app.tools.mcp.getStatus()` (in-memory) and surfaced in a separate settings page — not in `config.yaml`, which is not editable via UI.

```
Agent Settings → Tools Tab
┌──────────────────────────────────────────────────────────┐
│ [built-in] memory_read     [System Tool]  [Remove]       │
│ [built-in] memory_write    [System Tool]  [Remove]       │
│ [simple]   web_search      [Tier 1 ▾]     [Remove]       │
│ [mcp]      brave::search   [Tier 2 ▾]     [Remove]       │
│ [mcp]      fs::read_file   [Tier 2 ▾]     [Remove]       │
│                                           [+ Add Tool]   │
└──────────────────────────────────────────────────────────┘

Settings → MCP Servers
┌──────────────────────────────────────────────────────────┐
│ brave-search   [● Connected]                             │
│ filesystem     [● Connected]                             │
└──────────────────────────────────────────────────────────┘
```

Changing a tier takes effect immediately for subsequent agent interactions.



