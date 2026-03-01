# Agent Memory System

## Overview

The Agent Memory System provides each agent with a private, persistent memory that spans across conversations and threads. Unlike traditional chat systems where context is limited to the current conversation's context window, agents can store, search, recall, update, and delete memories — building long-term knowledge that improves their effectiveness over time.

This is an **emergent memory system**: the agent manages its own memories with minimal structural constraints. The system provides tools and type categories, but the agent decides *what* to remember, *how* to organize it, and *when* to recall it.

### Inspiration

The system draws from two key concepts:

1. **LangChain Memory Types** — Memories are categorized as semantic (facts), episodic (experiences), or procedural (learned workflows), mirroring how humans organize long-term memory.

2. **Recursive Language Models (RLM)** — Instead of stuffing everything into a context window, the agent constructs targeted context by querying its memory store during its reasoning loop. This is functionally equivalent to RLM's recursive sub-calls against stored context.

---

## Architecture

### Storage Model

Memories are stored using the existing `Node`/`Edge` graph model in SQLite — no new tables are needed.

```
┌─────────────────────────────────────────────┐
│                   Node                       │
├─────────────────────────────────────────────┤
│ node_id:    INTEGER (PK, auto-increment)    │
│ type:       TEXT ("memory:semantic", etc.)   │
│ properties: JSON                             │
│ created_at: DATETIME                         │
│ updated_at: DATETIME                         │
└─────────────────────────────────────────────┘
         │                        │
    outgoing_edges           incoming_edges
         │                        │
┌─────────────────────────────────────────────┐
│                   Edge                       │
├─────────────────────────────────────────────┤
│ node_id:    INTEGER (PK)                    │
│ source_id:  INTEGER (FK → Node)             │
│ target_id:  INTEGER (FK → Node)             │
│ type:       TEXT ("memory:relates_to", etc.) │
│ properties: JSON                             │
└─────────────────────────────────────────────┘
```

### Type Convention

The `Node.type` field uses a `memory:<category>` prefix pattern:

| Node Type | Description |
|-----------|-------------|
| `memory:semantic` | Facts, knowledge, preferences, relationships |
| `memory:episodic` | Experiences, actions taken, outcomes observed |
| `memory:procedural` | Procedures, workflows, strategies |

Edge types for memory relationships also use the `memory:` prefix (e.g., `memory:relates_to`, `memory:supersedes`).

### Properties Schema

The `Node.properties` JSON field has two required fields and allows arbitrary additional data:

```json
{
  "agent_id": 3,
  "content": "The user prefers dark mode and concise responses",
  "...any additional fields the agent chooses to store..."
}
```

- `agent_id` (required): Links the memory to its owning agent. Enforced by the DAO layer.
- `content` (required): The primary text content, indexed by FTS5 for search.
- Additional fields: Entirely agent-defined. The agent can store structured metadata, tags, confidence scores, or anything else it finds useful.

### Privacy Model

Memory isolation is enforced at the DAO layer:
- Every DAO method requires an `agentId` parameter
- All queries filter by `agent_id` in the properties JSON
- An agent **cannot** read, search, update, or delete another agent's memories
- The ad-hoc chat agent (used in the `/api/v1/chat` endpoint) does **not** have memory tools — it has no persistent identity

---

## Full-Text Search (FTS5)

### Virtual Table

A contentless FTS5 virtual table provides fast text search over memory content:

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  node_id UNINDEXED,    -- Stored for joins, not searchable
  agent_id UNINDEXED,   -- Stored for filtering, not searchable
  type,                 -- Indexed: enables type-scoped searches
  content,              -- Indexed: the main searchable text
  content='',           -- Contentless: no data duplication
  contentless_delete=1  -- Enables DELETE operations
);
```

### Database Triggers

FTS sync is handled entirely by SQLite triggers on the `Node` table. The DAO does standard Prisma CRUD and the FTS index stays consistent automatically.

**INSERT trigger** — fires only for memory nodes:
```sql
CREATE TRIGGER memory_fts_insert AFTER INSERT ON Node
WHEN NEW.type LIKE 'memory:%'
BEGIN
  INSERT INTO memory_fts (rowid, node_id, agent_id, type, content)
  VALUES (
    NEW.node_id, NEW.node_id,
    json_extract(NEW.properties, '$.agent_id'),
    NEW.type,
    json_extract(NEW.properties, '$.content')
  );
END;
```

**UPDATE trigger** — deletes old entry, re-inserts with new values:
```sql
CREATE TRIGGER memory_fts_update AFTER UPDATE ON Node
WHEN NEW.type LIKE 'memory:%'
BEGIN
  DELETE FROM memory_fts WHERE rowid = OLD.node_id;
  INSERT INTO memory_fts (rowid, node_id, agent_id, type, content)
  VALUES (
    NEW.node_id, NEW.node_id,
    json_extract(NEW.properties, '$.agent_id'),
    NEW.type,
    json_extract(NEW.properties, '$.content')
  );
END;
```

**DELETE trigger** — cleans up FTS entries:
```sql
CREATE TRIGGER memory_fts_delete AFTER DELETE ON Node
WHEN OLD.type LIKE 'memory:%'
BEGIN
  DELETE FROM memory_fts WHERE rowid = OLD.node_id;
END;
```

**Key properties:**
- `WHEN ... LIKE 'memory:%'` — zero overhead for non-memory operations (chat messages, etc.)
- `json_extract` — pulls `agent_id` and `content` from properties at trigger time
- Requires SQLite ≥ 3.43.0 for `contentless_delete=1` (bundled `better-sqlite3` ships 3.45+)

### Search Queries

The DAO's `searchMemories` method joins FTS results back to the Node table for filtering.

**Important:** Because `memory_fts` is a **contentless** FTS5 table, column values (like `agent_id`, `content`) cannot be read back from it. Only `rowid` and `rank` are available. Filtering by `agent_id` and `type` must happen on the joined `Node` table:

```sql
SELECT n.node_id, n.type, n.properties, n.created_at, n.updated_at, f.rank
FROM memory_fts f
JOIN Node n ON n.node_id = f.rowid
WHERE memory_fts MATCH ?
  AND json_extract(n.properties, '$.agent_id') = ?
ORDER BY f.rank
LIMIT ?
```

FTS5 ranking: lower rank values = better matches. The `rank` column uses BM25 scoring by default.

### Query Sanitization

User queries are sanitized before being passed to FTS5 MATCH:
- Each word is wrapped in double quotes to treat as literal terms
- Special FTS5 syntax characters are escaped
- Empty queries return an empty result set

---

## Memory Tools

The agent interacts with its memory via 7 LangChain tools, created by the `createMemoryTools(agentId)` factory function. Each tool is scoped to the agent's ID.

### store_memory

Store a new memory for future reference.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `"semantic" \| "episodic" \| "procedural"` | Yes | The category of memory |
| `content` | `string` | Yes | The memory content — be descriptive |
| `metadata` | `Record<string, any>` | No | Additional structured data |

**Returns:** `{ success, memory_id, type, message }`

### search_memories

Full-text search across own memories, ranked by relevance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | Search query terms |
| `type` | `"semantic" \| "episodic" \| "procedural" \| null` | No | Filter by memory type |
| `limit` | `number (1-50)` | No | Max results (default: 10) |

**Returns:** `{ success, results: [{ memory_id, type, content, metadata, created_at, rank }], message }`

### recall_memory

Retrieve a specific memory by its ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memory_id` | `number` | Yes | The memory ID to retrieve |

**Returns:** `{ success, memory: { memory_id, type, content, metadata, created_at, updated_at } }`

### update_memory

Update an existing memory's content or metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memory_id` | `number` | Yes | The memory ID to update |
| `content` | `string \| null` | No | New content (null keeps existing) |
| `metadata` | `Record<string, any> \| null` | No | Metadata to merge in |

**Returns:** `{ success, memory_id, message }`

### forget_memory

Delete a memory that is no longer accurate or useful.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memory_id` | `number` | Yes | The memory ID to delete |

**Returns:** `{ success, message }`

### link_memories

Create a named relationship between two memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_id` | `number` | Yes | Source memory ID |
| `target_id` | `number` | Yes | Target memory ID |
| `relationship` | `string` | Yes | Relationship type (e.g., "relates_to", "supersedes") |
| `properties` | `Record<string, any> \| null` | No | Relationship metadata |

**Returns:** `{ success, message }`

### get_related

Get memories linked to a specific memory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memory_id` | `number` | Yes | The memory to find connections for |
| `relationship` | `string \| null` | No | Filter by relationship type |

**Returns:** `{ success, results: [{ memory_id, type, content, created_at }], message }`

---

## Context Construction (RLM-Inspired)

The tool-based approach implements context construction naturally: during the agent's reasoning loop (ReAct pattern), the agent calls `search_memories` and `recall_memory` *before* formulating its response. This allows the agent to assemble targeted context from long-term memory rather than relying on a fixed context window.

### Flow Example

```
User: "Can you help set up the monitoring dashboard again?"

Agent reasoning loop:
  1. "The user says 'again' — I may have helped with this before."
     → search_memories(query: "monitoring dashboard setup")
     → Returns: Memory #42 (episodic): "Set up Grafana dashboard for user..."
                Memory #15 (procedural): "Dashboard setup procedure: 1. SSH to..."

  2. "Let me get the full procedure."
     → recall_memory(memory_id: 15)
     → Returns full procedural memory with step-by-step instructions

  3. "I also want to check if there are related configurations."
     → get_related(memory_id: 15)
     → Returns: Memory #23 (semantic): "Monitoring stack uses Prometheus + Grafana on port 3000"

  4. Agent now has precise context assembled from 3 memories, responds with specific knowledge.

  5. "The new dashboard has different port requirements."
     → update_memory(memory_id: 23, content: "Monitoring stack uses Prometheus + Grafana on port 9090")
     → Memory updated for future reference.
```

### How It Differs from Traditional Context Windows

| Aspect | Traditional Context Window | Memory + Context Construction |
|--------|---------------------------|-------------------------------|
| **Scope** | Current conversation only | All past interactions |
| **Capacity** | Fixed token limit | Unlimited storage, selective retrieval |
| **Relevance** | Everything in window equally weighted | Agent searches for specific relevant context |
| **Control** | System manages what fits | Agent decides what to fetch |
| **Persistence** | Lost when thread ends | Persists indefinitely |

---

## Integration

### Agent Runtime

Memory tools are automatically injected into every registered agent via `AgentRuntime.getAgent()`:

```typescript
// backend/src/lib/agents/agent-runtime.ts
getAgent(shutdownSignal: AbortSignal) {
  const memoryTools = createMemoryTools(this.id);
  const systemPrompt = `${this.systemPrompt}\n\n${MEMORY_SYSTEM_PROMPT}`;

  return createAgent({
    model: this.llm,
    name: this.name,
    checkpointer,
    systemPrompt,
    tools: memoryTools,
    signal: shutdownSignal
  })
}
```

### System Prompt

The `MEMORY_SYSTEM_PROMPT` (defined in `backend/src/lib/agents/memory-prompt.ts`) is appended to every agent's system prompt. It describes:
- Available memory types and their intended use
- All 7 memory tools and their purpose  
- Guidelines for memory management (be selective, update outdated info, link related concepts)

The prompt is *guidance*, not prescription — agents develop their own memory strategies over time.

### What Doesn't Get Memory

The ad-hoc chat endpoint (`POST /api/v1/chat`) creates ephemeral agents with no persistent identity. These do **not** receive memory tools. Memory is exclusive to registered agents that have a database identity (`agent_id`).

---

## Data Model Reference

### File Locations

| File | Purpose |
|------|---------|
| `backend/src/lib/models/memory.ts` | Zod schemas and TypeScript types for memory |
| `backend/src/lib/dao/memory.dao.ts` | Data access layer — CRUD, search, linking |
| `backend/src/lib/tools/memory-tools.ts` | LangChain tool definitions (factory function) |
| `backend/src/lib/agents/memory-prompt.ts` | System prompt fragment for memory guidance |
| `backend/src/lib/agents/agent-runtime.ts` | Integration point — tools + prompt injection |
| `backend/prisma/migrations/20260228120000_add_memory_fts/migration.sql` | FTS5 table + trigger definitions |

### Querying Memory Directly (Debugging)

To inspect an agent's memories directly in SQLite:

```sql
-- List all memories for agent 3
SELECT node_id, type, json_extract(properties, '$.content') as content, created_at
FROM Node
WHERE type LIKE 'memory:%'
  AND json_extract(properties, '$.agent_id') = 3
ORDER BY created_at DESC;

-- Full-text search (what the agent sees)
-- Note: contentless FTS5 — must join on f.rowid, filter on Node columns
SELECT n.node_id, n.type, json_extract(n.properties, '$.content') as content, f.rank
FROM memory_fts f
JOIN Node n ON n.node_id = f.rowid
WHERE memory_fts MATCH 'dashboard setup'
  AND json_extract(n.properties, '$.agent_id') = 3
ORDER BY f.rank;

-- View memory relationships
SELECT
  e.type as relationship,
  json_extract(src.properties, '$.content') as source_content,
  json_extract(tgt.properties, '$.content') as target_content
FROM Edge e
JOIN Node src ON src.node_id = e.source_id
JOIN Node tgt ON tgt.node_id = e.target_id
WHERE e.type LIKE 'memory:%'
  AND json_extract(src.properties, '$.agent_id') = 3;

-- Check FTS sync (should match Node count for memory types)
SELECT COUNT(*) FROM memory_fts;
SELECT COUNT(*) FROM Node WHERE type LIKE 'memory:%';
```

---

## Evaluation

The memory system should be evaluated at three levels:

### Level 1 — Tool Correctness (Unit Tests)

Verify that each memory tool works correctly in isolation:

- Store a memory → recall it → content matches
- Search for a known memory → found in results
- Update a memory → recall shows new content
- Delete a memory → recall returns not found
- Agent scoping → agent A cannot see agent B's memories
- FTS ranking → more relevant results ranked higher
- Trigger filtering → inserting a non-memory Node does NOT create an FTS entry

### Level 2 — Search Quality (Integration Tests)

Verify FTS5 returns relevant results:

- **Recall accuracy**: Seed memories, run queries, measure precision@k and recall@k
- **Semantic proximity**: "user prefers dark mode" should match "the user set their theme to dark"
- **Type filtering**: Search with type filter returns only memories of that type
- **Edge traversal**: Linked memories are correctly returned by `get_related`
- **Trigger consistency**: FTS table stays consistent after insert/update/delete sequences

### Level 3 — Agent Behavior (AI-Judged)

Evaluate how well agents use their memory in realistic scenarios:

- Run a multi-turn conversation where the agent *should* use memory
- After N turns, inspect: Did the agent store appropriate memories? Did it recall relevant context? Did it avoid noise?
- Use a second LLM as judge: given the transcript and memory operations log, score on a rubric (relevance, completeness, noise ratio)
- Track metrics over time: memories stored per conversation, search-to-store ratio, memory utilization rate

---

## Future Considerations

### Vector/Semantic Search

The current FTS5 approach provides keyword-based search. A future phase could add embedding-based semantic search for better "fuzzy" matching. Options:
- **SQLite + embedded vector store** (e.g., `vectra`, `sqlite-vss`): No external dependencies
- **Chroma via HTTP API**: Matches the original design doc approach
- **Hybrid search**: Combine FTS5 keyword results with vector similarity scores

### Inter-Agent Memory Sharing

Currently each agent's memory is fully private. Future enhancements:
- **Shared namespaces**: Agents publish memories to a shared namespace others can read
- **Memory delegation**: An agent can explicitly share a memory with another agent
- **Hierarchical access**: Role-based permissions for memory namespace access

### Memory Consolidation

As memory grows, agents may benefit from:
- **Summarization**: Periodically summarize clusters of related memories into higher-level insights
- **Reflection**: An agent reviews its own memories and writes meta-memories about patterns
- **Expiry**: Mark memories with confidence/relevance scores, prune low-value ones

### Embedding Provider Integration

When vector search is added, the config system (`config.example.yaml`) already has placeholder structure for embedding providers:
```yaml
database:
  embeddings:
    provider: ollama
    model: nomic-embed-text
```
