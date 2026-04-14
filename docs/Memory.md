# Agent Memory Architecture: Short-Term Trimming + RLM Scratchpad

## Overview

This document describes a layered memory architecture for LLM agents that combines
two complementary strategies to manage context window size without sacrificing context
quality:

1. **Short-Term Message Trimming** — keeps the raw conversation history small
2. **RLM Scratchpad** — preserves the context that trimming would otherwise discard

Neither strategy is sufficient alone. Together they form a self-reinforcing system
where the context window is always **small but high-quality**.

---

## The Problem

LLM agents have a fixed context window. Naively, every turn accumulates:

- The full conversation history
- Raw tool outputs (articles, API responses, search results, etc.)
- Repeated injections of the same content on every turn

This leads to two failure modes:

| Failure Mode | Cause |
|---|---|
| **Recency bias / forgetting** | Important early context is pushed out of the window |
| **Token waste** | Large raw tool outputs consume budget on every turn even when no longer needed |

---

## The Solution: Two Cooperative Layers

### Layer 1 — Short-Term Message Buffer (Thread-Scoped)

Managed reactively by `beforeModel` middleware. Responsible **only** for the
`messages[]` array passed to the LLM each turn.

**Rule:** Only the last N messages are sent to the model. Older messages are trimmed.

This is safe *because* the scratchpad has already distilled the trimmed content.
Without the scratchpad, trimming is a destructive lossy operation. With it, trimming
is a clean handoff.

### Layer 2 — RLM Scratchpad (Thread-Scoped, Persisted in Checkpoint)

A structured, navigable working memory that lives in the LangGraph checkpoint alongside
the message history. It grows with the conversation but stays within budget through
auto-decomposition, re-composition, and selective injection.

The scratchpad is the **source of truth** for everything that has been trimmed from the
message buffer.

---

## The Memory Lifecycle

The scratchpad is not the end of the memory pipeline — it is the distillation layer
between raw conversation content and long-term memory. The full lifecycle is:

```
Thread Contents & Tool Calls
  → Distilled by reflection into scratchpad sections
    → Promoted to long-term memory (at thread close or on prune)
      → Seeded back into scratchpad at cold-start of new thread
        → Available to agent immediately without tool call
```

This circle means the agent never starts a new thread blind — prior knowledge is
always available — and the scratchpad acts as a quality gate ensuring only
reflection-distilled content reaches long-term storage, never raw tool output or
noisy conversation history.

---

## Long-Term Memory

### The Three Memory Types

The architecture uses three distinct memory types, each with a different write
authority, retrieval pattern, and cold-start injection strategy. All three are
scoped to `user_id` — the simplest viable scope that ensures memories accumulate
against the user regardless of which thread or agent produced them.

| Memory Type | What it stores | Written by | Scope |
|---|---|---|---|
| **Procedural** | Instructions, preferences, learned behaviors that govern agent conduct | Operator or confirmed user intent | `user_id` |
| **Semantic** | Distilled knowledge from past conversations and tool results | Middleware promotion from scratchpad | `user_id` |
| **Episodic** | Lessons learned from significant actions, decisions, and outcomes | Middleware automatically | `user_id` |

> **Why `user_id` for episodic, not `thread_id`?** A thread is just where a lesson
> was learned, not where it should live. Scoping episodic memory to the thread means
> a user who creates many short threads never accumulates lessons across them. Scoping
> to `user_id` ensures lessons persist regardless of thread habits.

### Storage Format

All three memory types share a flat, tagged format in the store. Each entry is a
short text value with a `type` tag, a creation timestamp, and a `source` attribute
for traceability. The `source` is recorded for debugging but is not used as a
retrieval key.

```xml
<memories>
  <memory type="procedural" createdAt="2026-04-13">
    Always use TypeScript for new projects.
  </memory>

  <memory type="procedural" createdAt="2026-04-13">
    Always include error handling in async functions.
  </memory>

  <memory type="semantic" createdAt="2026-04-13" source="thread:abc123">
    User's project uses a Turborepo monorepo with Next.js frontend and
    Fastify backend. Shared packages live under /packages.
  </memory>

  <memory type="episodic" createdAt="2026-04-13" source="thread:abc123">
    Attempted to access api.staging.example.com — received 403.
    Solution: root cause was missing VPN connection; resolved by prompting
    user to connect before retrying.
  </memory>
</memories>
```

### Write Authority

**Procedural** — Written explicitly by the operator or in response to confirmed
user intent (e.g. "always respond in Spanish from now on"). The agent must not
self-author procedural memory without confirmation, because procedural memory
governs its own future behavior. Human-in-the-loop before write.

**Semantic** — Written by middleware promotion from the scratchpad at two trigger
points:
- **On prune** — when a section expires, its selection frequency is evaluated.
  High-frequency sections are promoted; low-frequency sections are skipped.
  Expired does not automatically mean permanently valuable.
- **On thread close** — surviving scratchpad sections are promoted based on
  selection frequency. Sections with `origin="long-term:semantic"` that were
  never selected in this thread are not re-promoted.

**Episodic** — Written automatically by middleware on every significant action:
tool calls that produce notable outcomes, access failures, task completions,
and corrective actions. The agent does not choose whether to record episodic
events. The format is always:

```
<one sentence description of what happened>
Solution: <one sentence description of how it was resolved, if applicable>
```

### Retrieval

Retrieval is split by memory type:

**Procedural** — loaded deterministically by `user_id` at cold-start and injected
directly into the system prompt. Always present. Never searched. The agent sees it
as part of its identity, not as retrieved knowledge.

**Semantic and Episodic** — retrieved on demand via tools backed by the existing
FTS index. The agent is not given semantic or episodic content directly (except
for a small number of high-confidence semantic entries at cold-start — see below).
Instead it is given a standing instruction and two retrieval tools:

```typescript
// Search episodic memory — lessons learned from past actions
recall_episodes({ query: string })

// Search semantic memory — distilled knowledge from past conversations
recall_knowledge({ query: string })
```

The agent generates the query from its current context, which means retrieval is
always driven by what the agent actually needs at that moment rather than what the
middleware guessed it might need at cold-start. Results returned by either tool
are processed by `afterModel` reflection — if the agent surfaces useful content
from a retrieval, the reflection LLM may write it into the scratchpad as a working
section, subject to normal TTL and selection rules.

### Cold-Start Seeding

On turn 1 of a new thread, before any user message has been processed:

```
beforeModel (turn 1 only)
    │
    ├─ Load procedural memory by user_id
    │   → inject all entries into system prompt
    │   → inject standing instruction for recall_episodes and recall_knowledge
    │
    └─ Load semantic memory by user_id
        → filter to high-confidence entries only
          (high confidence = selected frequently across multiple prior threads)
        → seed filtered entries into scratchpad as new leaf sections
          lastSelectedTurn = 1, initialTTL from type defaults
          origin = "long-term:semantic"
```

Episodic memory is never injected at cold-start. The standing instruction in the
system prompt tells the agent when to call `recall_episodes`. This prevents the
system prompt from bloating as the episodic log grows over time.

### System Prompt Shape at Cold-Start

```xml
<system>
  You are a coding assistant.

  <procedural-memory>
    • Always use TypeScript for new projects
    • Always include error handling in async functions
    • Prefer functional programming patterns
  </procedural-memory>

  <memory-instructions>
    Before attempting any task that involves accessing external systems,
    executing multi-step operations, or solving an error you have not
    seen before in this conversation — check your episodic memory first
    using the recall_episodes tool. You may have encountered this before.

    Use the recall_knowledge tool when you need domain knowledge or context
    about the user's project that is not already in your working memory.
  </memory-instructions>
</system>
```

### Fresh Scratchpad at Cold-Start

```xml
<scratchpad>
  <toc>
    <entry name="user-project-context"
           description="User's monorepo architecture and stack" />
    <entry name="user-preferences"
           description="Communication style and response formatting" />
  </toc>

  <sections>
    <!--
      Seeded from high-confidence long-term semantic memory.
      origin attribute prevents re-promotion if never selected this thread.
      Subject to normal TTL and selection rules.
    -->
    <section type="text" name="user-project-context"
             lastSelectedTurn="1" initialTTL="10"
             origin="long-term:semantic">
      <content><![CDATA[
        User's project uses a Turborepo monorepo. Frontend is Next.js,
        backend is a Fastify API. Shared packages live under /packages.
      ]]></content>
    </section>

    <section type="text" name="user-preferences"
             lastSelectedTurn="1" initialTTL="5"
             origin="long-term:semantic">
      <content><![CDATA[
        Prefers concise bullet-pointed responses.
        Prefers TypeScript over JavaScript in all examples.
      ]]></content>
    </section>
  </sections>

  <graveyard />
</scratchpad>
```

Episodic memory never appears in the scratchpad directly at cold-start. When the
agent calls `recall_episodes`, results arrive as tool messages. The reflection LLM
then decides whether to write any retrieved content into the scratchpad as a working
section — if it does, that section lives and expires like any other.

---

## Agent Invocation

### Message Type

All agent invocations — regardless of origin — use `HumanMessage` as the trigger.
This is consistent with the LangChain ecosystem convention and ensures compatibility
with all LangChain tooling, tracing, and human-in-the-loop patterns without special
cases.

There is no distinct message type for system- or automation-originated triggers.
The trigger context is instead communicated via `configurable` metadata (see below).

### Trigger Configurable

Every invocation must include two properties in the `configurable` object alongside
`thread_id`:

| Property | Type | Description |
|---|---|---|
| `triggerOrigin` | `"user" \| "automation"` | Where the trigger came from. Used by middleware for branching logic and TTL defaults. |
| `triggerType` | `string` (free text) | Further refinement of the trigger for tracking and observability. No enumerated values yet — descriptive text until an automation system is defined. |

```typescript
// User-initiated conversation
await agent.invoke(
  { messages: [new HumanMessage("Summarize my emails")] },
  {
    configurable: {
      thread_id: "user-123",
      triggerOrigin: "user",
      triggerType: "chat",
    },
  }
);

// Scheduled job
await agent.invoke(
  { messages: [new HumanMessage("Run the nightly audit report")] },
  {
    configurable: {
      thread_id: "audit-2026-04-13",
      triggerOrigin: "automation",
      triggerType: "scheduled:nightly-audit",
    },
  }
);

// Webhook
await agent.invoke(
  { messages: [new HumanMessage("New email received from alice@example.com")] },
  {
    configurable: {
      thread_id: "inbox-watcher",
      triggerOrigin: "automation",
      triggerType: "webhook:email",
    },
  }
);
```

### How Middleware Uses Trigger Context

The `triggerOrigin` and `triggerType` values are available to all middleware via
`configurable` in both `beforeModel` and `afterModel` hooks. The primary use cases
are:

- **Turn counter** — increments on every `beforeModel` first call regardless of
  `triggerOrigin`. All invocations advance the counter equally; the trigger context
  does not affect the count.
- **Observability and logging** — `triggerOrigin` and `triggerType` are included
  in all middleware log output so that scratchpad operations can be traced back to
  their originating trigger.
- **Future extensibility** — once an automation system is defined, `triggerOrigin`
  provides a clean boolean branch point for middleware that needs to behave
  differently for automated vs. user-initiated turns (e.g., different `initialTTL`
  defaults, different reflection behavior, suppressed HITL interrupts).

---

## Checkpoint State Schema

The middleware relies on two dedicated fields in the LangGraph checkpoint state,
scoped to the `thread_id`. These fields are persisted and reloaded automatically
by LangGraph on every invocation alongside the message history.

```typescript
interface MiddlewareCheckpointState {
  // Monotonically incrementing counter of agent turns.
  // Represents the number of times beforeModel has been called as the
  // first call of a turn — i.e. the number of HumanMessages that have
  // initiated agent work, regardless of triggerOrigin.
  // Initialized to 0. Must never be derived from messages.length.
  turnCount: number;

  // The full scratchpad XML, serialized as a string.
  // Initialized to an empty string on turn 1.
  scratchpad: string;
}
```

### Turn Counter

`turnCount` is the source of truth for all TTL calculations. It is:

- **Incremented once per turn** — at the top of `beforeModel`, guarded by the
  same first-call flag that prevents double injection, before any other processing
- **Never derived from `messages.length`** — tool call messages are also appended
  to the messages array within a turn, which would cause `messages.length` to
  advance multiple times per user turn and corrupt all TTL calculations
- **Never reset** — the counter is monotonically increasing for the lifetime of
  the thread

```typescript
// beforeModel — runs once per turn only
beforeModel: (state, runtime) => {
  if (state.__beforeModelHasRun) return; // guard: only run once per turn

  // Increment the turn counter first, before any other processing
  const currentTurn = (state.turnCount ?? 0) + 1;

  // All subsequent TTL calculations within this turn use currentTurn
  // ...
  return { ...state, turnCount: currentTurn, __beforeModelHasRun: true };
}
```

---

## Per-Turn Lifecycle

The middleware hooks into two points per turn:

- **`beforeModel`** — runs before the *first* LLM call of the turn. Injects
  context, trims message history, increments `turnCount`.
- **`afterModel`** — runs after *each* LLM call of the turn, including
  intermediate calls made during tool execution. This allows the scratchpad to
  reflect on multi-step tool reasoning as it unfolds rather than only seeing the
  final state.

> **Why `afterModel` instead of `afterAgent` for reflection:**  
> Using `afterModel` means reflection can observe the model's reasoning at each
> step — including intermediate tool calls, partial conclusions, and any content
> the model surfaces mid-turn. This produces higher-quality scratchpad updates
> than a single end-of-turn reflection over a potentially long tool chain. The
> `__beforeModelHasRun` flag in state tracks whether `beforeModel` has already
> fired this turn so that counter increment, context injection, and trimming only
> happen once.

```
User/Automation Message (always HumanMessage)
    │
    ▼
┌──────────────────────────────────────────────────┐
│          beforeModel middleware (once)            │
│                                                  │
│  1. Increment turnCount in checkpoint            │
│  2. Cold-start seeding (turn 1 only)             │
│     → Load procedural memory by user_id          │
│       → inject into system prompt                │
│       → inject standing recall instruction       │
│     → Load semantic memory by user_id            │
│       → filter to high-confidence entries        │
│       → seed as scratchpad sections              │
│         (origin="long-term:semantic")            │
│  3. Load scratchpad from checkpoint              │
│  4. Navigate scratchpad tree                     │
│     → select sections relevant to turn          │
│  5. Increment lastSelectedTurn on all            │
│     selected leaf sections                       │
│  6. If no live sections selected (hard miss)     │
│     → inject graveyard tombstones               │
│     (future: size guard may be needed)           │
│  7. Inject selected sections into system message │
│  8. Trim messages[] to last N turns              │
│     (safe — scratchpad holds prior context)      │
└──────────────────────────────────────────────────┘
    │
    ▼
LLM Call
(receives: system prompt + injected scratchpad sections + last N messages)
    │
    ▼
┌──────────────────────────────────────────────────┐
│          afterModel middleware (each call)        │
│                                                  │
│  9.  Reflect on messages since last afterModel   │
│  10. Update scratchpad                           │
│      → append / rewrite / remove sections       │
│  11. Prune expired sections                      │
│      → evaluate for long-term promotion         │
│        (high selection frequency → promote)     │
│      → move to graveyard with tombstone         │
│  12. Prune expired graveyard tombstones          │
│  13. Auto-decompose oversized sections           │
│  14. Re-compose under-populated parents          │
│  15. Write episodic events to store              │
│      (significant tool outcomes, failures,       │
│       corrective actions — always automatic)     │
│  16. Persist scratchpad to checkpoint            │
└──────────────────────────────────────────────────┘
    │
    ▼
Tool Calls (if any) → Tool Results
    │
    ▼
LLM Call (tool reasoning)
    │
    ▼
[afterModel runs again for this call]
    │
    ▼
AI Response (final)
    │
    ▼
[afterModel runs for final response]
    │
    ▼
┌──────────────────────────────────────────────────┐
│            Thread Close (if applicable)           │
│                                                  │
│  17. Promote surviving scratchpad sections       │
│      to long-term semantic memory by user_id     │
│      (weighted by selection frequency;           │
│       origin="long-term:semantic" sections       │
│       only re-promoted if selected this thread)  │
│  18. Promote confirmed procedural changes        │
│      to long-term procedural memory by user_id   │
└──────────────────────────────────────────────────┘
    │
    ▼
Turn Complete
```

---

## The Scratchpad

### Data Structure

The scratchpad is stored as XML in the LangGraph checkpoint state (`scratchpad`
field), scoped to the `thread_id`. It starts flat and deepens organically through
use.

```
Scratchpad
├── TOC         (flat list of top-level section names + summaries for navigation)
├── Sections[]
│   ├── Section (leaf)        — name, description, content,
│   │                           lastSelectedTurn*, initialTTL, origin?
│   └── Section (decomposed)  — name, description, summary + child TOC
│       ├── Section (leaf)      TTL derived: max(children TTL)
│       └── Section (leaf)      TTL derived: max(children TTL)
└── Graveyard[] (pruned sections — one-sentence tombstones with fixed countdown TTL)
```

> \* `lastSelectedTurn` is an explicit attribute on every leaf section element in
> the XML. It **must** be initialized to `currentTurn` (the value of `turnCount`
> after incrementing) at the moment the section is created. If initialized to `0`
> or left unset, a section created mid-conversation will compute a negative
> `effectiveTTL` and expire immediately.

> The optional `origin` attribute is set to `"long-term:semantic"` on sections
> seeded from long-term memory at cold-start. At promotion time, sections with
> this attribute are only re-promoted if they were selected at least once during
> the thread, preventing unchanged memories from being written back to the store.

#### TTL Rules — Live Sections

- **Only leaf sections carry a stored TTL.** Parent TTL is always derived at read
  time as `max(children effectiveTTL)`. This prevents orphaned children and avoids
  a parent expiring while live children remain.

- **TTL is not a mutable counter.** Each leaf stores `lastSelectedTurn` and
  `initialTTL`. Effective TTL is computed lazily using `turnCount` from the
  checkpoint:

  ```
  effectiveTTL = initialTTL - (turnCount - lastSelectedTurn)
  expired      = effectiveTTL <= 0
  ```

  Writes only happen on selection (`lastSelectedTurn`) or creation (`initialTTL`).
  Expiry is a read-time filter applied once per turn during pruning.

- **`initialTTL` is set at section creation** based on section type:

  | Section Type | Default `initialTTL` | Rationale |
  |---|---|---|
  | `tool` | `10` | Represents expensive fetched content; should persist longer |
  | `text` (general notes) | `5` | Standard working memory |
  | `text` (ephemeral) | `2` | Short-lived observations, transient state |

- **`selectionCredit`** (default: `2`) is added to `lastSelectedTurn` on each
  selection. To prevent sections becoming immortal through continuous selection,
  `lastSelectedTurn` is capped at `turnCount + sectionCreditCap`:

  ```
  lastSelectedTurn = min(
    lastSelectedTurn + selectionCredit,
    turnCount + sectionCreditCap
  )
  ```

  | Config | Default | Description |
  |---|---|---|
  | `selectionCredit` | `2` | Turns of credit granted per selection |
  | `sectionCreditCap` | `10` | Maximum turns `lastSelectedTurn` can lead `turnCount` |

- **Date-based expiry** is not a TTL concern. If content should expire by a
  specific date or condition, the reflection LLM handles this semantically via an
  explicit `remove` operation during `afterModel`. TTL is a purely structural
  mechanism; semantic relevance is the LLM's responsibility.

#### TTL Rules — Graveyard Tombstones

Tombstones follow a simpler, fixed countdown model:

- **`createdAtTurn`** is recorded as the value of `turnCount` when the tombstone
  is written.
- **`graveyardTTL`** is a single configurable value (default: `30`) applied to
  all tombstones regardless of the originating section type.
- Effective tombstone TTL is computed lazily:

  ```
  tombstoneEffectiveTTL = graveyardTTL - (turnCount - createdAtTurn)
  expired               = tombstoneEffectiveTTL <= 0
  ```

- **Tombstone TTL never resets.** If content is needed again it should be
  re-fetched or re-derived and written back as a new live section. The tombstone
  remains until its own `graveyardTTL` expires.

#### XML Representation

```xml
<scratchpad>
  <toc>
    <entry name="article" description="Super Cool Article content and key points" />
    <entry name="user-preferences" description="Communication style and formatting" />
  </toc>

  <sections>
    <section type="tool" name="article" description="Super Cool Article">
      <toc>
        <entry name="setup" description="How to setup the package" />
        <entry name="basic-usage" description="Walk through of a basic usage example" />
        <entry name="real-world-example" description="A real world example" />
        <entry name="conclusion" description="Key takeaway" />
      </toc>
      <section name="setup" lastSelectedTurn="6" initialTTL="10">
        <content><![CDATA[...]]></content>
      </section>
      <section name="basic-usage" lastSelectedTurn="8" initialTTL="10">
        <content><![CDATA[...]]></content>
      </section>
      <section name="real-world-example" lastSelectedTurn="8" initialTTL="10">
        <content><![CDATA[...]]></content>
      </section>
      <section name="conclusion" lastSelectedTurn="3" initialTTL="5">
        <content><![CDATA[...]]></content>
      </section>
    </section>

    <section type="text" name="user-preferences"
             lastSelectedTurn="9" initialTTL="5"
             origin="long-term:semantic">
      <content><![CDATA[Prefers concise bullet-pointed responses.]]></content>
    </section>
  </sections>

  <graveyard>
    <entry
      name="introduction"
      createdAtTurn="14"
      summary="Article introduction covering the author's motivation for writing about X."
      retrieval="Not available — derived content, no external source."
    />
  </graveyard>
</scratchpad>
```

### Section Lifecycle

```
New content arrives (via reflection or cold-start seeding)
    │
    ├─ append / rewrite → section created or updated
    │   └─ lastSelectedTurn = turnCount (initialized at creation)
    │   └─ initialTTL assigned from type-based config default
    │   └─ origin = "long-term:semantic" if seeded from long-term store
    │
    ▼
Section lives in the scratchpad
    │
    ├─ Selected in beforeModel
    │   └─ lastSelectedTurn = min(
    │        lastSelectedTurn + selectionCredit,
    │        turnCount + sectionCreditCap
    │      )
    │
    ├─ Not selected for N turns
    │   └─ effectiveTTL approaches 0
    │
    ├─ All but one child expire
    │   └─ Re-composition: surviving child content merged back into parent
    │      Parent reverts to a leaf; empty siblings removed
    │
    ▼ (effectiveTTL <= 0 detected in afterModel pruning pass)
    │
    ├─ Evaluate for long-term semantic memory promotion
    │   └─ origin="long-term:semantic" and never selected → skip promotion
    │   └─ High selection frequency → promote to semantic store under user_id
    │   └─ Low selection frequency → skip promotion
    │
Prune → Graveyard
    │  Reflection generates one-sentence tombstone summary
    │  Tombstone records retrieval instructions or marks as unrecoverable
    │  createdAtTurn = turnCount; graveyardTTL countdown begins (never resets)
    │  Entry moved to <graveyard>; section removed from <sections>
    ▼
Graveyard entry visible to navigation LLM on hard miss only
    → Surfaces "this context has expired" to the agent
    → Agent can re-fetch via tool if source is still available
    → If re-fetched, written back as a new live section; tombstone remains
      until its own graveyardTTL expires
    │
    ▼ (graveyardTTL - (turnCount - createdAtTurn) <= 0)
    │
Tombstone pruned — no further record retained
```

### Auto-Decomposition

When a section's content exceeds the configured size threshold, the middleware
decomposes it automatically:

```
Section content exceeds maxSectionSize threshold
    │
    ▼
Middleware calls LLM (narrow context — only the oversized section):
    → summarize: produce a short paragraph describing what this section contains
    → split: divide original content into 2-4 named sub-sections
    │
    ▼
Parent content ← summary
Children       ← named sub-sections (each initialized with turnCount and initialTTL)
    │
    ▼ (if a child later exceeds threshold)
Same rule fires recursively
```

### Re-Composition

The inverse of auto-decomposition. When a decomposed parent has only one surviving
child (its siblings having expired), that child's content is merged back into the
parent and the parent reverts to a leaf:

```
afterModel pruning pass detects parent with one remaining child
    │
    ▼
Parent content ← child content
Parent lastSelectedTurn ← child lastSelectedTurn
Parent initialTTL ← child initialTTL
Child removed
Parent is now a leaf — eligible for future decomposition if it grows again
```

> Re-composition preserves the surviving child's TTL state so the merged section
> does not get an artificially extended lifespan.

### Discovery (Navigation)

Before each model call, the middleware navigates the scratchpad tree to find the
sections most relevant to the current turn:

```
Root TOC presented to LLM
    → LLM selects relevant section names
    → if selection is non-empty (normal case):
        For each selected section:
            if leaf     → inject content into system message
                        → lastSelectedTurn updated with credit cap applied
            if parent   → present child TOC, recurse
        Inject all collected leaf content
    → if selection is empty (hard miss):
        Present graveyard entries to LLM
        Inject relevant tombstones into system message
        (tombstone TTL unchanged — no credit applied)
        Note: a size guard on graveyard injection may be needed in future
```

If the entire scratchpad fits within `fullInjectThreshold`, navigation is skipped
and the full XML is injected directly.

### Error Handling

Reflection, decomposition, and re-composition all involve LLM calls that can fail.
The middleware follows a consistent error handling strategy:

| Failure Type | Strategy |
|---|---|
| Reflection LLM call fails | Log error, skip scratchpad update for this call. No document change. |
| Decomposition LLM call fails | Log error, revert section to original content. No document change. |
| Re-composition fails | Log error, leave parent and surviving child as-is. No document change. |
| Long-term memory promotion fails | Log error, skip promotion. Section remains in graveyard until tombstone expires. |
| Episodic write fails | Log error, skip write. The turn's scratchpad update is unaffected. |
| `recall_episodes` / `recall_knowledge` tool fails | Log error, return empty result to agent. Agent proceeds without retrieved context. |
| Structured output schema violation | Retry once with instructions to correct the structure. On second failure, log error and skip update. |

All errors are recorded through the existing middleware error logging pattern.
Structured output is enforced with a single retry before giving up — the principle
being that a missed scratchpad update is always preferable to a corrupted one.

---

## Prompts

The system requires four distinct LLM prompts. Each is a static file checked into
the repository and treated as a code artifact — prompt changes go through PR review
and are atomically revertable with the code that depends on them.

A runtime override mechanism is reserved for future use: if a database record exists
for a given agent configuration it takes precedence over the static file, enabling
per-agent tuning and hot fixes without a deployment.

---

### Prompt 1 — Navigation

**Used in:** `beforeModel`, once per turn, during scratchpad discovery.

**Purpose:** Given the current TOC and recent message history, select which scratchpad
sections are relevant to the current turn so their content can be injected into the
model's context. This is a relevance filtering decision, not a content generation task.

#### Scope

| | Included | Rationale |
|---|---|---|
| ✅ | Current TOC (names + descriptions only) | The selection space the LLM is choosing from |
| ✅ | Last N messages (recent history) | Provides the conversational context for relevance judgement |
| ✅ | Current turn number (`turnCount`) | Allows reasoning about recency of prior selections |
| ❌ | Full section content | Not needed to select sections; would inflate cost |
| ❌ | Full message history | Beyond recent context, history is in the scratchpad |
| ❌ | Graveyard entries | Only surfaced on a hard miss — not part of normal navigation |
| ❌ | System prompt | Navigation is a mechanical task; agent identity is irrelevant |

**Output:** A JSON array of section names in order of relevance. No prose, no
explanation — raw JSON only. If no sections are relevant, an empty array is returned
and the hard miss graveyard path is triggered.

---

### Prompt 2 — Reflection

**Used in:** `afterModel`, on every LLM call within a turn, including intermediate
tool-reasoning calls.

**Purpose:** Given the incremental messages since the last `afterModel` call and the
current TOC, decide what scratchpad updates are needed to record what just happened.
This is the primary mechanism by which the scratchpad stays current and useful.

#### Scope

| | Included | Rationale |
|---|---|---|
| ✅ | Incremental messages since last `afterModel` | The only content being reflected on |
| ✅ | Current TOC (names + descriptions only) | Required to identify existing sections to write to |
| ✅ | Current turn number (`turnCount`) | Allows reasoning about recency |
| ❌ | Full section content | Not needed to write; would inflate cost significantly |
| ❌ | Full message history | Defeats the purpose of the architecture |
| ❌ | Graveyard entries | Not relevant to reflection decisions |
| ❌ | System prompt | Reflection is a mechanical task; agent identity is irrelevant |

**Output:** Zero or more structured operations (`append`, `rewrite`, `remove`). The
prompt enforces the following rules:

- **Operation selection heuristics:**
  - `append` when new information adds genuinely new detail that does not contradict
    or supersede existing content
  - `rewrite` when new information supersedes, corrects, or reorganizes existing
    content — prefer `rewrite` over `append` whenever existing content would become
    misleading or redundant
  - `remove` when a section is no longer relevant — framed as a positive action
    that improves agent focus
  - Zero operations when nothing meaningful occurred — not every model call produces
    scratchpad-worthy content; the filter heuristic is *"would this be useful to a
    future turn with no access to the current message history?"*

- **Naming convention:** All section names must be kebab-case. Before creating a
  new section, check the TOC — if the content belongs to an existing section, use
  its exact name. New section names must be specific (`article-setup-steps`, not
  `notes`). Generic names (`summary`, `info`, `misc`, `notes`) are not permitted
  as top-level section names.

- **Scope discipline:** Operate only on the current increment. Do not reorganize,
  rename, or merge existing sections. Do not reflect on prior turns not present in
  the current increment. The tree structure is managed by the middleware — the
  reflection LLM always writes to a flat name-based interface.

---

### Prompt 3 — Decomposition: Summarize

**Used in:** `afterModel`, during auto-decomposition, when a section exceeds
`maxSectionSize`. Runs before the split prompt on the same oversized content.

**Purpose:** Produce a concise summary of an oversized section's content to replace
it as the parent node after decomposition. The summary serves as the parent's new
content — a brief description of what the section contains and what its children
hold, enabling cheap navigation without reading child content.

#### Scope

| | Included | Rationale |
|---|---|---|
| ✅ | The oversized section's full content | The only input needed for summarization |
| ✅ | The section's name and description | Provides context for what the summary should cover |
| ❌ | Message history | Summarization is content-only; conversation context is irrelevant |
| ❌ | TOC or other sections | Summarization is scoped to a single section in isolation |
| ❌ | Scratchpad structure | The LLM does not need to know about the tree |

**Output:** A single short paragraph (2-4 sentences) describing what the section
contains. No bullet points, no headings, no metadata — plain prose only. This
summary will be displayed in the TOC and as the parent node's content after
decomposition.

---

### Prompt 4 — Decomposition: Split

**Used in:** `afterModel`, during auto-decomposition, immediately after the
summarize prompt has run on the same oversized content.

**Purpose:** Divide an oversized section's content into 2-4 coherent, self-contained
named sub-sections. Each sub-section should be meaningful in isolation — a future
turn selecting only one child should get complete, usable context without needing
its siblings.

#### Scope

| | Included | Rationale |
|---|---|---|
| ✅ | The oversized section's full content | The content being divided |
| ✅ | The section's name and description | Provides context for how to divide the content |
| ✅ | The parent's existing child TOC (names only) | Prevents new child names colliding with existing siblings |
| ❌ | Message history | Splitting is content-only; conversation context is irrelevant |
| ❌ | Full sibling section content | Names are sufficient for collision avoidance |
| ❌ | Root TOC or other sections | Splitting is scoped to a single section in isolation |
| ❌ | Scratchpad structure | The LLM does not need to know about the tree |

**Output:** A structured array of 2-4 sub-section objects, each containing:
- `name` — kebab-case, specific, describes the sub-section's content precisely.
  Must not reuse the parent's name or any name already present in the parent's
  existing child TOC. Generic names (`part-1`, `section-a`, `misc`) are not
  permitted.
- `description` — one sentence describing what this sub-section contains
- `content` — the sub-section's full content extracted or derived from the original

The content of all sub-sections combined should fully cover the original section's
content without significant omission or duplication.

---

## Metrics

All Layer 1 metrics are fully automatable — they require no LLM evaluation and are
derived entirely from middleware instrumentation. Each metric should be collected
per-turn and per-thread, and aggregated over time to establish baselines. Anomalies
relative to baseline are more meaningful than absolute values.

---

### Scratchpad Health

| Metric | Collected at | What it measures | Healthy signal | Warning signal |
|---|---|---|---|---|
| **Section creation rate** | `afterModel` | New sections written per turn | Stable, low single digits | Consistently high → reflection is noisy; consistently zero → reflection is missing content |
| **Section rewrite rate** | `afterModel` | Ratio of `rewrite` ops to `append` ops | Moderate — rewrites should outnumber appends over time | Very low → duplicate content accumulating; very high → sections are too unstable |
| **TTL at expiry** | `afterModel` (pruning pass) | `effectiveTTL` value at the moment a section is pruned | Consistently near `0` | Consistently very negative → sections expiring unnoticed for many turns; TTL values may need tuning |
| **Section selection rate** | `beforeModel` | Ratio of sections selected to sections available in TOC | Moderate — not all sections should be selected every turn | Consistently near zero → navigation is failing or scratchpad content is irrelevant to actual turns |
| **Hard miss rate** | `beforeModel` | Frequency of navigation returning empty, triggering graveyard fallback | Rare | Frequent → scratchpad is not capturing what the agent needs |
| **Decomposition frequency** | `afterModel` | How often auto-decomposition fires per thread | Occasional | High → `maxSectionSize` may be too small or reflection is writing verbose sections |
| **Re-composition frequency** | `afterModel` | How often re-composition fires per thread | Occasional | Spike alongside high decomposition → over-decomposition/re-composition churn |
| **Graveyard size over time** | `afterModel` | Tombstone count at each turn within a thread | Grows then stabilizes as old tombstones expire | Grows without bound → `graveyardTTL` may be too high or tombstones are not expiring correctly |

---

### Long-Term Memory Health

| Metric | Collected at | What it measures | Healthy signal | Warning signal |
|---|---|---|---|---|
| **Promotion rate** | Thread close / prune | Sections promoted to long-term semantic store per thread | Low but non-zero — quality bar should filter most sections | Zero across many threads → promotion threshold too strict or selection frequency too low; very high → quality bar too loose |
| **Episodic write rate** | `afterModel` | Episodic entries written per turn | Proportional to tool call volume | Drops to zero while tool calls are active → episodic middleware may have failed silently |
| **`recall_episodes` call rate** | Tool invocation | How often the agent calls the episodic retrieval tool | Non-zero in threads involving external systems or multi-step tasks | Never called → agent is ignoring the standing instruction; called every turn → agent is over-relying on retrieval |
| **`recall_knowledge` call rate** | Tool invocation | How often the agent calls the semantic retrieval tool | Non-zero in threads where prior knowledge is relevant | Same signals as `recall_episodes` |
| **Cold-start seed count** | `beforeModel` (turn 1) | Number of sections seeded from long-term semantic memory at thread open | Grows gradually over the user's lifetime as knowledge accumulates | Stays at zero after many threads → semantic promotion is not working |
| **Seeded section selection rate** | `beforeModel` | Ratio of `origin="long-term:semantic"` sections selected vs. total seeded | Should be meaningfully above zero | Consistently near zero → cold-start navigation is seeding irrelevant memories |

---

### Context Window Efficiency

| Metric | Collected at | What it measures | Healthy signal | Warning signal |
|---|---|---|---|---|
| **Tokens injected per turn** | `beforeModel` | Total tokens consumed by scratchpad section injection into the system message | Stable as thread grows — scratchpad navigation should keep this bounded | Grows steadily with thread length → scratchpad is bloating; navigation is not filtering effectively |
| **Messages trimmed per turn** | `beforeModel` | Number of messages removed by the short-term buffer | Non-zero in threads longer than `recentTurns` | Zero in long threads → trimming is not firing; very high → `recentTurns` may be too small |
| **System prompt token size** | `beforeModel` | Total size of the system prompt including procedural memory and standing instructions | Stable — procedural memory grows slowly and intentionally | Grows rapidly → procedural memory is accumulating without pruning |
| **Total context consumed per turn** | `beforeModel` | Sum of system prompt tokens + injected scratchpad tokens + trimmed message tokens | Stays well within model context window limit | Approaches context window limit → architecture is not keeping the window under control |

---

## Testing

### Layer 1 — Schema Compliance

The most mechanical layer. Validates that each LLM prompt reliably produces output
conforming to its structured output schema before any behavioral testing begins.

- Feed fixed inputs to each prompt, assert output matches the expected Zod schema
- Test edge cases per prompt:
  - Navigation: empty TOC, TOC with 20+ sections, all sections irrelevant
  - Reflection: empty incremental messages, TOC with 0 sections, TOC with 20 sections
  - Summarize: very short content (under threshold), very long content
  - Split: content that divides naturally, content that resists clean division
- Test the retry path: feed intentionally malformed responses, assert retry triggers
  and recovers correctly for each prompt

### Layer 2 — Operation Correctness (Golden Dataset)

Validates that each prompt produces the correct output for a given scenario. These
are classification and structure tests run against a fixed dataset with known correct
answers. The dataset must be re-run on every prompt change.

**Reflection prompt scenarios:**

| Scenario | Expected behavior |
|---|---|
| Tool returns an article the user asked to summarize | `append` to a new `article-*` section |
| User corrects a preference stated two turns ago | `rewrite` of the relevant preferences section |
| User says "forget what I said about X" | `remove` of the relevant section |
| Small-talk turn with no actionable content | Zero operations |
| Tool returns data that partially updates prior data | `rewrite`, not `append` |
| Two consecutive appends to the same section | Second call should `rewrite`, not double-append |
| New content clearly belongs to an existing TOC section | Reuses existing section name exactly |
| New content is a distinct topic with no existing section | Creates a new kebab-case section name |
| LLM proposes a generic name (`notes`, `summary`, `misc`) | Flagged as a prompt regression |

**Split prompt scenarios:**

| Scenario | Expected behavior |
|---|---|
| Content has clear natural divisions | Sub-sections map to those divisions |
| Content has no clear divisions | 2 sub-sections of roughly equal size |
| Split produces a child named same as parent | Flagged as a prompt regression |
| Split produces a child named same as existing sibling | Flagged as a prompt regression |
| Split produces a generic child name (`part-1`, `misc`) | Flagged as a prompt regression |
| All sub-section content combined covers original | No significant omission or duplication |

### Layer 3 — Scratchpad Quality Over Time (Integration)

Validates scratchpad coherence across a realistic multi-turn conversation. Partially
automated, partially human-evaluated. A test harness:

1. Replays a scripted multi-turn conversation
2. Snapshots the scratchpad state after each turn
3. At defined checkpoints, asks an evaluator LLM: *"Given this scratchpad state and
   this user message, does the agent have the context it needs to respond correctly?"*
4. Tracks scratchpad size growth over turns as a proxy for bloat and churn

Minimum conversation archetypes required in the test suite:

| Archetype | Description |
|---|---|
| **Deep dive** | User explores one topic in detail over many turns |
| **Context switch** | User abruptly changes topics multiple times |
| **Return** | User leaves a topic, discusses something else, then returns |

---

## Configuration Reference

| Parameter | Default | Description |
|---|---|---|
| `recentTurns` | `8` | Number of messages kept in the short-term buffer |
| `selectionCredit` | `2` | Turns of credit added to `lastSelectedTurn` on each selection |
| `sectionCreditCap` | `10` | Maximum turns `lastSelectedTurn` can lead `turnCount` |
| `fullInjectThreshold` | *(size)* | Scratchpad size below which navigation is skipped |
| `maxSectionSize` | `800` | Character threshold triggering auto-decomposition |
| `initialTTL.tool` | `10` | Default TTL for `tool`-type sections |
| `initialTTL.text` | `5` | Default TTL for general `text` sections |
| `initialTTL.ephemeral` | `2` | Default TTL for short-lived `text` sections |
| `graveyardTTL` | `30` | Turns a tombstone survives before permanent removal |

---

## Example: Article Summarization

### Without RLM (naive)

```
Turn 1: [system] [user: summarize article] [tool: <3000 token article>] [ai: summary]
Turn 3: [system] [user: summarize] [tool: <article>] [ai]...[user: follow-up] [ai]
                                    ↑ article still consuming tokens every turn
Turn 8: context overflow — agent forgets Turn 1 content
```

### With RLM + Short-Term Trim + Long-Term Memory

```
Cold-start (new thread, returning user)
  beforeModel → procedural memory loaded: "Always use TypeScript"
              → semantic memory seeded: "user-project-context", "user-preferences"
              → standing recall instruction injected into system prompt
              → scratchpad initialized with 2 seeded sections, graveyard empty

Turn 1  (turnCount = 1)
  afterModel  → scratchpad gains section "article" (type: tool, initialTTL: 10)
                lastSelectedTurn initialized to 1

Turn 2  (turnCount = 2)
  beforeModel → messages trimmed to last 8
              → "article" selected; lastSelectedTurn = min(1+2, 2+10) = 3

Turn 5  (turnCount = 5, user drilling into a specific section)
  afterModel  → "article" exceeds maxSectionSize, auto-decomposes:
                article/setup | article/basic-usage | article/real-world | article/conclusion
                each child: lastSelectedTurn = 5, initialTTL = 10

Turn 6  (turnCount = 6)
  beforeModel → navigation selects only "article/basic-usage"
              → lastSelectedTurn = min(5+2, 6+10) = 7
              → siblings untouched, their effectiveTTL counting down

Turn 8  (turnCount = 8, agent hits a server access error)
  afterModel  → episodic write: "Attempted to access api.staging.example.com
                — received 403. Solution: user connected VPN, request succeeded."

Turn 16 (turnCount = 16, conclusion never selected since Turn 5)
  afterModel  → "article/conclusion": effectiveTTL = 10 - (16 - 5) = -1 → expired
              → selection frequency low → skip long-term promotion
              → tombstone written: createdAtTurn = 16
              → section pruned from <sections>

Turn 20 (turnCount = 20, only basic-usage child remains)
  afterModel  → re-composition: basic-usage content merged into article parent
              → article reverts to a leaf with basic-usage's TTL state

Thread close
  → "article" section: high selection frequency
    → promoted to semantic store under user_id
  → "user-preferences" section: origin="long-term:semantic", selected 4 times
    → re-promoted with updated content
  → "user-project-context" section: origin="long-term:semantic", never selected
    → skipped — not re-promoted

Next cold-start (new thread, same user)
  beforeModel → "article" now appears in semantic memory TOC
              → seeded into scratchpad if selected during navigation
              → episodic memory available via recall_episodes tool
              → agent prompted: "check recall_episodes before accessing
                external systems"
```

---

## The Virtuous Feedback Loop

```
Trim aggressively
    → forces scratchpad to be the source of truth
        → reflect incrementally on each model call
            → scratchpad quality improves continuously
                → navigate precisely
                    → only relevant sections injected
                        → more tokens available for reasoning
                            → better reasoning → better reflection
                                → high-quality sections promoted to long-term memory
                                    → cold-start seeding improves future threads
                                        → agent uses lessons learned via recall tools
                                            → repeat
```

---

## Design Considerations

### Reflection Cost

Each `afterModel` call adds one LLM reflection call. With multi-step tool chains
this means multiple reflection calls per user turn. To keep this manageable:

- **Suppress from client stream** — run with `{ callbacks: [] }`
- **Use a fast/cheap model** — reflection does not require full agent capability
- **Consider async execution** — reflection can run as a background job, unblocking
  the client response sooner. Note: async reflection means the scratchpad update
  for turn N may not be visible until turn N+2

### Trim Depth Tuning

| Parameter | Too small | Too large |
|---|---|---|
| `recentTurns` | Agent loses recent conversational flow | Token budget wasted on raw history |
| `maxSectionSize` | Scratchpad decomposes too aggressively | Sections bloat before decomposing |

For local Ollama models with smaller context windows, lower values for both are
advisable.

### Graveyard Management

- Tombstones are surfaced only on a **hard miss** — when the navigation LLM selects
  no live sections — to avoid bloating the context window during normal operation.
- TTL never resets. Re-fetched content is written as a new live section.
- Permanent removal is silent — no record is retained after `graveyardTTL` expires.
- A size guard on graveyard injection may be needed in future if graveyard size
  becomes a practical concern in long conversations.

### Long-Term Memory Growth

The `user_id`-scoped store will grow monotonically over time. Two concerns to
monitor in production:

- **Semantic store size** — high-confidence promotion keeps this bounded in
  practice, but a maximum entry count per user may be needed eventually.
- **Episodic store size** — written on every significant action with no expiry.
  A rolling retention window (e.g. keep last 90 days) should be defined before
  the episodic log becomes a retrieval quality problem.

---

## Follow-Up Items

| # | Item | Priority |
|---|---|---|
| 1 | **Episodic retention window** — Define a rolling retention policy for the episodic store (e.g. keep last 90 days or last N entries per user). Without this the episodic log grows indefinitely and FTS retrieval quality degrades as the signal-to-noise ratio drops. | Medium |
| 2 | **Semantic promotion threshold** — Define what "high selection frequency" means quantitatively. Candidates: selected in more than N threads, selected more than M times total, or a combined score. This threshold gates what enters long-term semantic memory. | Medium |
| 3 | **Metric baselines** — All Layer 1 metrics require baseline values to be meaningful. After initial deployment, run the system against scripted conversations for a defined period to establish expected ranges for each metric before treating anomalies as actionable signals. | Medium |
| 4 | **Deduplication** — The user_id-scoped store will accumulate near-duplicate entries over many threads (e.g. the same user preference promoted from multiple threads). A periodic deduplication pass against the FTS index will be needed at scale. | Low |
| 5 | **Automation-aware TTL defaults** — Once an automation system is defined and `triggerType` values are enumerated, consider whether automated turns should use different `initialTTL` defaults than user-initiated turns. | Low |