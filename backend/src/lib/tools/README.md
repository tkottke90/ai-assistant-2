# Tool Management System

This directory contains the entire tool layer for the AI Assistant — the infrastructure that lets
agents discover, request permission for, and execute tools at runtime.

---

## Table of Contents

- [Tool Management System](#tool-management-system)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Tool Sources](#tool-sources)
    - [Namespaced IDs](#namespaced-ids)
    - [Permission Tiers](#permission-tiers)
    - [Agent Assignment](#agent-assignment)
  - [How It All Fits Together](#how-it-all-fits-together)
  - [Built-in Tools (the Permission System)](#built-in-tools-the-permission-system)
    - [The Five Built-ins](#the-five-built-ins)
    - [The Agent's Tool Use Loop](#the-agents-tool-use-loop)
  - [Adding a Simple Tool](#adding-a-simple-tool)
    - [1. Write the tool module](#1-write-the-tool-module)
    - [2. Register it in config.yaml](#2-register-it-in-configyaml)
    - [3. Assign it to an agent](#3-assign-it-to-an-agent)
  - [Adding an MCP Server](#adding-an-mcp-server)
    - [What is MCP?](#what-is-mcp)
    - [1. Add the server to config.yaml](#1-add-the-server-to-configyaml)
    - [2. Assign tools to agents](#2-assign-tools-to-agents)
    - [Connection lifecycle and reconnects](#connection-lifecycle-and-reconnects)
  - [Architecture Reference](#architecture-reference)
    - [File Map](#file-map)
    - [Startup Sequence](#startup-sequence)
    - [Data Model Summary](#data-model-summary)

---

## Overview

When an agent starts a conversation turn it has access to two categories of tools:

1. **Built-in tools** — always present on every agent. These are the discovery and permission tools that
   let agents find out what other tools exist and request approval to use sensitive ones.
2. **Assigned tools** — the actual capability tools (web search, code execution, file access, etc.)
   that are explicitly linked to a specific agent by an operator or user.

All tools — regardless of source — are registered in a database table (`Tool`) and identified by a
**namespaced string ID**. This lets the permission system, the audit log, the REST API, and the
LangGraph runtime all talk about the same tool with zero ambiguity.

---

## Key Concepts

### Tool Sources

There are three ways a tool enters the system:

| Source | Description |
|---|---|
| `built-in` | Hard-coded into this application. Seeded to the DB at startup. Cannot be removed. |
| `simple` | A JavaScript file you write and point at from `config.yaml`. Loaded at startup. |
| `mcp` | A tool exposed by an external [MCP server](#adding-an-mcp-server) over stdio or HTTP. Discovered at startup. |

### Namespaced IDs

Every tool has a string `id` that encodes its source so collisions are structurally impossible:

```
built-in::discover_tools
built-in::execute_tool
simple::web_search
mcp::my-server::read_file
```

Agents and the permission system always reference tools by these IDs.

### Permission Tiers

Every tool has a **tier** (1, 2, or 3) that controls how an agent is allowed to use it.

| Tier | Meaning | Agent behaviour |
|---|---|---|
| **1** | High-risk / requires human approval | Must call `request_permission` → suspend → wait for user approval → call `execute_action` |
| **2** | Moderate risk, automatically allowed | Can call `execute_tool` directly |
| **3** | Low/no risk, automatically allowed | Can call `execute_tool` directly |

A tool has an optional `locked_tier` set at source. If set, it cannot be overridden per-agent.
If not set, the tier is whatever the operator configured when assigning the tool to the agent
(defaults to 1 — safest).

### Agent Assignment

Tools are not globally available to all agents. An operator explicitly links a tool to an agent
by creating an `AgentTool` record (via the REST API or the UI drawer). This record stores:

- Which agent has the tool
- What tier it runs at for that agent (if the tool doesn't have a `locked_tier`)

Unassigned tools are invisible to an agent — they won't appear in `discover_tools` search results
and cannot be executed.

---

## How It All Fits Together

At a high level, this is the lifecycle of a tool call during a conversation:

```
Agent turn starts
    │
    ├─ ToolManager injects built-in tools + assigned tools into the LangGraph invocation
    │
    ▼
Agent calls discover_tools("I need to search the web")
    │
    ├─ search.ts queries the DB for assigned tools (via AgentToolDao)
    ├─ Applies tier visibility rules (Tier 2/3 always show, Tier 1 on keyword match only)
    └─ Returns ToolSummary list
    │
    ▼
Agent inspects a tool with get_tool_details("simple::web_search")
    │
    └─ registry.ts resolves the full ToolManifest including effective tier
    │
    ▼
If Tier 1:  agent calls request_permission(...)
    │        └─ creates AgentAction record (status=Pending)
    │        └─ LangGraph interrupt() suspends the graph
    │        └─ User sees the pending request in the UI
    │        └─ User approves → graph is resumed
    │        └─ Agent calls execute_action(action_id)
    │               └─ executor.ts runs the tool, writes result to AgentAction
    │
If Tier 2/3:  agent calls execute_tool(tool_id, params)
    │          └─ executor.ts runs the tool, logs anonymously to AgentAction
    │
    ▼
Tool result returned as tool message in LangGraph
```

---

## Built-in Tools (the Permission System)

These five tools are defined in `builtin/tools.ts` and are injected into **every agent** by
`ToolManager.getBuiltinTools()`. They are seeded to the `Tool` DB table at startup by
`builtin/index.ts` and always have `locked_tier: 3` — meaning the agent can always call them
without any permission check.

### The Five Built-ins

| Tool name | What it does |
|---|---|
| `discover_tools` | Semantic/keyword search across all tools assigned to this agent. Returns lightweight `ToolSummary` objects. |
| `get_tool_details` | Returns the full `ToolManifest` for a specific tool — schema, tier, capabilities. Use this before forming a permission request. |
| `request_permission` | Creates a `Pending` `AgentAction` and calls LangGraph `interrupt()`, pausing the agent until a human approves or denies. |
| `execute_action` | Resumes an `Approved` `AgentAction`. Runs all tool calls in the batch and returns results. |
| `execute_tool` | Directly executes a Tier 2 or Tier 3 tool without any approval step. Fails immediately if the tool is Tier 1. |

### The Agent's Tool Use Loop

The built-in toolset is designed so agents follow a consistent, auditable pattern:

1. **Discover** — find relevant tools with `discover_tools`
2. **Inspect** — read the schema with `get_tool_details`
3. **Act** — either call `request_permission` (Tier 1) or `execute_tool` (Tier 2/3)
4. **Execute** — after approval, call `execute_action` with the returned `action_id`

---

## Adding a Simple Tool

A "simple tool" is a JavaScript file you write yourself that exports a factory function. It's the
right choice when you have a small, self-contained capability that doesn't justify running a
separate MCP server process. Load time is synchronous to the backend startup.

### 1. Write the tool module

Create a `.js` file somewhere inside or alongside your `CONFIG_DIR`. The module must have a
**default export** that is a function accepting one argument (your config object) and returning a
LangChain `StructuredTool`.

```js
// config/tools/web-search.js
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export default function create(config) {
  return tool(
    async ({ query }) => {
      // Your implementation — call an API, run a script, etc.
      const resp = await fetch(`https://api.example.com/search?q=${query}&key=${config.api_key}`);
      const data = await resp.json();
      return JSON.stringify(data.results);
    },
    {
      name: 'web_search',
      description: 'Search the web and return a list of relevant results.',
      schema: z.object({
        query: z.string().describe('Search query'),
      }),
    }
  );
}
```

**Requirements:**
- Default export must be a function (the factory)
- Factory must return a `StructuredTool` (has `.name` and `.invoke()`)
- Use a Zod schema for the tool's input — it will be stored in the DB as the `input_schema`

### 2. Register it in config.yaml

Add an entry under `tools.simple` in your `config/config.yaml`:

```yaml
tools:
  simple:
    - id: web_search           # Unique ID within your simple tools — becomes "simple::web_search"
      name: Web Search          # Human-readable label
      description: Search the web for current information
      path: tools/web-search.js # Relative to CONFIG_DIR
      runtime: node             # Only "node" is supported in v1
      config:
        api_key: "your-api-key-here"  # Passed to create(config) at load time
```

The tool will be available as `simple::web_search` immediately after the backend restarts.

> **Note on secrets**: The `config` block is stored in `config.yaml` on disk. Avoid putting
> high-value secrets here. Use environment variables in your factory if needed:
> `process.env.SEARCH_API_KEY`.

### 3. Assign it to an agent

After the backend starts, use the UI (Agents → drawer → Tools tab) or the REST API to create an
`AgentTool` record linking the tool to your agent. Until you do this, the tool exists in the
registry but no agent can see or use it.

```http
POST /api/v1/agents/:agentId/tools
Content-Type: application/json

{
  "tool_id": "simple::web_search",
  "tier": 2
}
```

---

## Adding an MCP Server

### What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard for exposing
tools (and resources) to AI agents over a well-defined interface. An MCP server is any process that
speaks the protocol — it can be a local subprocess you spawn, or a remote HTTP endpoint.

This application connects to MCP servers at startup using
[`@langchain/mcp-adapters`](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters).
Every tool exposed by the server is automatically registered in the `Tool` DB table with the prefix
`mcp::<server-id>::<tool-name>` and is then available for assignment to agents.

Two transport modes are supported:

| Transport | Description | When to use |
|---|---|---|
| `stdio` | The backend spawns the server as a child process and communicates over stdin/stdout | Local tools, scripts, OS integrations |
| `http` | The backend connects to a running HTTP server implementing the MCP Streamable HTTP spec | Remote/shared tools, Docker-based servers |

### 1. Add the server to config.yaml

**stdio example** — the backend will `spawn` the given command:

```yaml
tools:
  mcp_servers:
    - id: filesystem          # Unique ID — becomes part of every tool's namespaced ID
      name: Filesystem Tools
      transport: stdio
      command: npx
      args:
        - -y
        - "@modelcontextprotocol/server-filesystem"
        - /home/user/workspace  # Any extra args your server needs
      env:
        NODE_ENV: production    # Optional env vars passed to the child process
```

**HTTP example** — the server must already be running:

```yaml
tools:
  mcp_servers:
    - id: my-remote-tools
      name: My Remote Tool Server
      transport: http
      url: https://tools.internal.example.com/mcp
```

**Docker MCP Toolkit example** — use the Toolkit gateway to expose an entire profile of servers
as a single `stdio` connection:

```yaml
tools:
  mcp_servers:
    - id: docker-mcp             # Becomes "mcp::docker-mcp::<tool-name>" for every tool in the profile
      name: Docker MCP Toolkit
      transport: stdio
      command: docker
      args:
        - mcp
        - gateway
        - run
        - --profile
        - my_profile             # Replace with the Docker Desktop profile name you created
```

The [Docker MCP Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/get-started/) is a
Docker Desktop feature (currently in Beta) that lets you browse a catalog of containerized MCP
servers, group them into named **profiles**, and expose the entire profile through a single gateway
process. Connecting this application to it via the gateway gives agents access to every server in
that profile without any per-server configuration here.

**Prerequisites:**

1. Docker Desktop 4.62 or later with the **Docker MCP Toolkit** beta feature enabled
   (Docker Desktop → Settings → Beta features → Enable Docker MCP Toolkit)
2. A profile created in the MCP Toolkit UI with at least one server added from the catalog
3. `docker` available on the `PATH` of the user running the backend process

**How it works:** The `docker mcp gateway run` command starts a gateway process that aggregates
all servers in the given profile and speaks the MCP `stdio` protocol. The backend's
`McpServerManager` spawns it as a child process at startup, discovers its tools, and registers
them in the DB as `mcp::docker-mcp::<tool-name>`. Adding or removing servers from the Docker
Desktop profile and restarting the backend is all that's needed to update the available tools.

> The `id` field is permanent. If you change it, any `AgentTool` records referencing the old
> server's tools will become orphaned. Rename with care.

### 2. Assign tools to agents

After startup, all tools discovered from the server appear in the registry. Assign them to agents
the same way as simple tools — via the UI or the REST API.

### Connection lifecycle and reconnects

When the backend starts, `McpServerManager` attempts to connect to all configured servers.
Partial failures are tolerated — a server that fails to connect logs a warning and the backend
continues. Tools from that server are simply unavailable.

A health check timer runs every **30 seconds**. Any server in `error` or `disconnected` state
is automatically retried. If it reconnects, its tools are restored to the active tool map and
agents can use them again in subsequent turns.

You can check the current status of all MCP servers at runtime:

```http
GET /api/v1/tools/mcp/status
```

---

## Architecture Reference

### File Map

```
tools/
├── manager.ts          ToolManager class — the central service attached to app.tools.
│                       Orchestrates startup: loads built-ins, simple tools, and MCP tools.
│                       Provides getBuiltinTools() and getToolsForAgent() to the AgentRuntime.
│
├── registry.ts         Pure functions for resolving ToolManifest / ToolSummary from DB rows.
│                       Knows how to compute the effective tier for a (tool, agent) pair.
│
├── search.ts           Two-pass keyword + semantic discovery used by discover_tools.
│                       Visibility rules: Tier 2/3 always appear, Tier 1 only on match.
│
├── executor.ts         Runs a single ToolCall against a LangChain StructuredTool.
│                       Logs the result back to AgentAction for audit.
│
├── checkpoint.ts       LangGraph utility — resolves the current user-turn checkpoint ID.
│                       Used by request_permission to scope denial records per turn.
│
├── models.ts           Plain TypeScript types shared across the tool layer.
│                       (DangerLevel, PermissionTier, ToolCall, ToolCallBatch, etc.)
│
├── memory-tools.ts     Agent memory tools (separate from the permission system).
│                       Always injected alongside the built-in permission tools.
│
├── builtin/
│   ├── index.ts        Seed function — upserts the five built-in Tool DB records at startup.
│   └── tools.ts        LangChain implementations of the five built-in permission tools.
│                       createBuiltinTools(ctx) wires in the ToolManager callbacks.
│
├── simple/
│   └── loader.ts       Dynamically imports simple tool JS modules from disk.
│                       Validates the module contract and upserts Tool DB records.
│
└── mcp/
    └── manager.ts      McpServerManager — wraps MultiServerMCPClient from @langchain/mcp-adapters.
                        Handles connect, upsert of DB records, health check, and auto-reconnect.
```

### Startup Sequence

```
app.ts calls setupTools(app)
    │
    ├── ToolsConfigSchema validated from config.yaml
    ├── McpServerManager instantiated
    └── ToolManager.init(config, configDir)
            │
            ├── seedBuiltinTools()         — upserts 5 Tool DB records
            ├── loadSimpleToolsFromConfig() — imports JS files, upserts Tool DB records
            └── loadMcpToolsFromConfig()    — connects to MCP servers, upserts Tool DB records
                    └── mcpManager.startHealthCheck()  — begins 30s reconnect loop

app.agents = AgentManager — agent startup calls app.tools.getBuiltinTools(agentId)
                                               and app.tools.getToolsForAgent(agentId)
```

### Data Model Summary

| Table | Purpose |
|---|---|
| `Tool` | Registry of all known tools. One row per tool, updated idempotently at startup. |
| `McpServer` | One row per configured MCP server. Acts as an FK anchor for Tool rows from that server. |
| `AgentTool` | Join table. Links a `Tool` to an `Agent` with a per-agent tier override. |
| `AgentAction` | Audit log of every permission request and tool execution. Stores the `ToolCallBatch` as JSON along with status (`Pending → Approved → InProgress → Completed`). |
