# Local-First AI Agent Platform — System Architecture

---

## Table of Contents

- [Local-First AI Agent Platform — System Architecture](#local-first-ai-agent-platform--system-architecture)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Core Design Principles](#core-design-principles)
  - [System Diagram](#system-diagram)
  - [Lifecycle State Machines](#lifecycle-state-machines)
    - [Thread Lifecycle](#thread-lifecycle)
    - [Memory Entry Lifecycle](#memory-entry-lifecycle)
    - [Skill Lifecycle](#skill-lifecycle)
    - [Task Lifecycle](#task-lifecycle)
    - [Scratchpad Entry Lifecycle](#scratchpad-entry-lifecycle)
  - [Memory Architecture](#memory-architecture)
    - [Hot Memory](#hot-memory)
    - [Cold Memory](#cold-memory)
    - [The Hot/Cold Boundary](#the-hotcold-boundary)
    - [Cold-to-Hot Promotion](#cold-to-hot-promotion)
    - [Long-Term Memory Tiers](#long-term-memory-tiers)
  - [Context Hydration](#context-hydration)
    - [Session Hydration](#session-hydration)
    - [Request Hydration](#request-hydration)
  - [Scratchpad](#scratchpad)
    - [Role in the Hot/Cold Model](#role-in-the-hotcold-model)
    - [Storage and Schema](#storage-and-schema)
    - [On-Demand Retrieval](#on-demand-retrieval)
  - [Skills System](#skills-system)
    - [Static and Learned Skills](#static-and-learned-skills)
    - [Skill Matching](#skill-matching)
    - [Skill Authoring and Promotion](#skill-authoring-and-promotion)
  - [Recursive Language Models (RLM)](#recursive-language-models-rlm)
    - [Purpose and Activation](#purpose-and-activation)
    - [Decomposition Strategy](#decomposition-strategy)
    - [Context Isolation](#context-isolation)
  - [Tool System](#tool-system)
    - [Tool Registry](#tool-registry)
    - [Dynamic Tool Selection](#dynamic-tool-selection)
    - [Tool Output Interception](#tool-output-interception)
    - [Human-in-the-Loop (HITL)](#human-in-the-loop-hitl)
  - [Middleware Layer](#middleware-layer)
    - [Middleware Stack (Execution Order)](#middleware-stack-execution-order)
  - [Agent Design](#agent-design)
    - [Agent Roles](#agent-roles)
    - [Leaf Agent Factory](#leaf-agent-factory)
  - [Graph Orchestration](#graph-orchestration)
    - [State Schema](#state-schema)
    - [Node Execution Order](#node-execution-order)
    - [Session Persistence](#session-persistence)
  - [The Self-Improving Loop](#the-self-improving-loop)
  - [Deferred Decisions](#deferred-decisions)
    - [Structural Decisions](#structural-decisions)
    - [Transition Policies](#transition-policies)
  - [Technology Stack](#technology-stack)
  - [Closing Principle](#closing-principle)

---

## Overview

This document describes the architecture of a **Local-First, Autonomous LLM Agent Platform** — a system that supports AI agents working independently and collaboratively on tasks, operating primarily on local, resource-constrained language models such as Llama 3.2 running via Ollama.

Local models present two hard constraints that every architectural decision is designed around:

- **Small context windows** — the model can only reason over a limited amount of text at once
- **Limited reasoning capacity** — complex multi-step planning degrades quickly without support

The platform addresses both constraints without sacrificing capability by keeping the model's context deliberately small and focused, and by offloading planning, memory, and tool management to the surrounding infrastructure.

---

## Core Design Principles

> **The model only ever operates on what it currently needs. Everything else is stored, indexed, and retrieved on demand.**

| Principle | Description |
|---|---|
| **Local-first** | Every design decision prioritises small, focused context windows suitable for constrained hardware |
| **Intentional context** | Nothing enters the model's context window by accident — every item is justified for the current task |
| **Separation of concerns** | Middleware handles constraints; the graph handles coordination; agents handle execution |
| **Self-improving** | The system learns reusable patterns over time through procedural memory and skill promotion |
| **Progressive complexity** | Simple requests are handled cheaply; complexity is added only when the task demands it |
| **Implementation-agnostic** | Architectural commitments are to principles, not specific backends or storage technologies |
| **Community extensibility** | Skills and tools are first-class contribution surfaces |

---

## System Diagram

The following diagram shows the full system — coordination graph, storage layer, and middleware — with each entity's lifecycle state machine annotated inline.

```
                              User Request
                                   │
                    ┌──────────────▼──────────────┐
                    │       Thread Check           │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐         ┌─────────────────────────────┐
                    │  new thread?                 │         │  THREAD LIFECYCLE           │
                    └──────┬───────────────┬───────┘         │                             │
                           │ yes           │ no              │  INITIALISING               │
                           ▼               ▼                 │    │ sessionHydrate runs     │
                   ┌──────────────┐ ┌─────────────┐         │    │ cold → hot (user facts) │
                   │   SESSION    │ │  RESUMING   │         │    ▼                         │
                   │  HYDRATION   │ │  hot memory │         │  READY                       │
                   │  cold → hot  │ │  restored   │         │    │ per-request hydration   │
                   └──────┬───────┘ └──────┬──────┘         │    ▼                         │
                          └───────┬─────────┘               │  HYDRATING                  │
                                  │                         │    │ query-matched cold→hot  │
                                  │  READY                  │    ▼                         │
                                  ▼                         │  PROCESSING                 │
                    ┌─────────────────────────┐             │    │ ◄── HITL pauses here   │
                    │    extractMemories       │             │    ▼                         │
                    │    REQUEST HYDRATION     │             │  RESPONDING                 │
                    │                         │             │    │ memories authored       │
                    │  cold store queried      │             │    │ scratchpad flushed      │
                    │  candidates scored:      │             │    ▼                         │
                    │  keyword × importance    │             │  ENDED / READY (next turn)  │
                    │  LLM filters to relevant │             └─────────────────────────────┘
                    │  → injectedMemories      │
                    └─────────────┬───────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐             ┌─────────────────────────────┐
                    │      matchSkill          │             │  SKILL LIFECYCLE            │
                    │                         │             │                             │
                    │  Stage 1:               │             │  PROCEDURAL MEMORY          │
                    │    keyword pre-filter   │             │    │ importance rising       │
                    │    (free, no LLM call)  │             │    │ accessCount rising      │
                    │  Stage 2:               │             │    ▼ (>= 0.9, >= 5 uses)    │
                    │    LLM confirmation     │             │  LEARNED SKILL              │
                    │    confidence >= 0.7    │             │    │ in registry             │
                    └──────┬──────────────────┘             │    │ useCount tracked        │
                           │                                │    │ successRate tracked     │
               ┌───────────┴───────────┐                   │    ▼ (review + stable)       │
          matched                  no match                 │  STATIC SKILL               │
               │                       │                   │    │                         │
               ▼                       ▼                   │    ├── success → maintained  │
        ┌─────────────┐         ┌─────────────┐            │    └── failure → DEPRECATED  │
        │  applySkill  │         │   router    │            └─────────────────────────────┘
        │              │         │             │
        │ steps loaded │         │ simple /    │
        │ as QUEUED    │         │ complex     │
        │ tasks        │         └──────┬──────┘
        └──────┬───────┘                │
               │               ┌────────┴────────┐
               │           simple             complex
               │               │                 │
               │               ▼                 ▼
               │      ┌──────────────┐   ┌──────────────┐    ┌──────────────────────────────┐
               │      │ simpleExec   │   │  decompose   │    │  TASK LIFECYCLE              │
               │      │              │   │              │    │                              │
               │      │ selectTools  │   │  QUEUED      │    │  QUEUED                      │
               │      │ createLeaf   │   │  task popped │    │    │ in taskQueue[]          │
               │      │ Agent(tools, │   │     │        │    │    ▼ decomposeNode pops      │
               │      │  scratchpad) │   │  too complex?│    │  STAGED → EXECUTING          │
               └──────►     │        │   │     │yes     │    │    │ selectTools runs        │
                      │     │        │   │     ▼        │    │    │ leafAgent invoked       │
                      │     │        │   │  split 2-3   │    │    │ tools called            │
                      │     │        │   │  child tasks │    │    ▼                        │
                      │     │        │   │  QUEUED ◄────┼─┐  │  COMPLETE                   │
                      │     │        │   │     │        │ │  │    │ result → results[]     │
                      │     │        │   │  simple?     │ │  │    ▼                        │
                      │     │        │   │     │        │ │  │  AGGREGATED                 │
                      │     │        │   │     ▼        │ │  │    │ all siblings complete  │
                      │     │        │   │  STAGED      │ │  │    ▼                        │
                      │     │        │   │  EXECUTING ──┼─┘  │  ⚠ ERROR PATH              │
                      │     │        │   │  COMPLETE    │    │    retry / fail / report    │
                      │     │        │   └──────┬───────┘    │    (policy: deferred)       │
                      │     │        │          │            └──────────────────────────────┘
                      └─────┼────────┘          │
                            │                   │
                            └────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │      aggregate       │
                          │                     │
                          │  results[] merged   │
                          │  → finalAnswer      │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐             ┌──────────────────────────────┐
                          │   authorMemories     │             │  MEMORY ENTRY LIFECYCLE      │
                          │  + maybeAuthorSkill  │             │                              │
                          │                     │             │  NEW  (authored here)        │
                          │  decomposedBySkill?  │             │    │ importance = initial    │
                          │    yes → reinforce   │             │    ▼ retrieved               │
                          │    no  → maybe write │             │  ACTIVE                     │
                          │         new skill    │             │    │ importance += 0.1       │
                          └──────────┬──────────┘             │    │ accessCount++           │
                                     │                        │    ▼ not retrieved           │
                                    END                       │  DECAYING                   │
                                                              │    │ importance *= 0.8       │
                                                              │    ▼ below threshold         │
                                                              │  PRUNED                     │
                                                              │                              │
                                                              │  procedural only:            │
                                                              │  importance >= 0.9           │
                                                              │  + accessCount >= 5          │
                                                              │    ▼                         │
                                                              │  → SKILL CANDIDATE           │
                                                              └──────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  STORAGE LAYER
  (all state transitions above ultimately read from or write to one of these three stores)

  ┌─────────────────────────────┐       ┌──────────────────────────────────────────────────┐
  │     Long-Term Memory        │       │  Scratchpad                                      │
  │  namespace: [memory,userId] │       │  namespace: [scratchpad, threadId]               │
  │                             │       │                                                  │
  │  episodic  ─────────────────┼──┐    │  ┌────────────────────────────────────────────┐  │
  │  semantic  ─── retrieve ◄───┼──┼────┼──┤  SCRATCHPAD ENTRY LIFECYCLE                │  │
  │  procedural ── inject ─────►┼──┘    │  │                                            │  │
  │                             │       │  │  tool call completes                       │  │
  │  ◄── author (post-response) │       │  │       │                                    │  │
  │  ◄── promote (from scratch) │       │  │  size <= threshold?                        │  │
  │                             │       │  │    yes → PASS THROUGH (no entry created)   │  │
  │  [decay job — periodic]     │       │  │    no  ▼                                   │  │
  │    importance *= 0.8        │       │  │       WRITTEN                              │  │
  │    below threshold → PRUNED │       │  │         │ full content → cold store        │  │
  │                             │       │  │         │ summary + ref → hot index        │  │
  └─────────────────────────────┘       │  │         ▼                                  │  │
                                        │  │       RETRIEVABLE                          │  │
                                        │  │    (LLM calls scratchpad_read              │  │
  ┌──────────────────────────────┐      │  │     keyword-scored chunks returned)        │  │
  │     Checkpoint Store         │      │  │         │                                  │  │
  │  namespace: [thread,threadId]│      │  │  session ends                              │  │
  │                              │      │  │         ▼                                  │  │
  │  conversation history        │      │  │     PRE-FLUSH                              │  │
  │  graph state snapshots       │      │  │    index passed to memory author           │  │
  │  hot memory between nodes    │      │  │         ▼                                  │  │
  │                              │      │  │  promote to LTM? ── yes ───────────────────┼──┼──► Long-Term Memory
  │  persists: across turns      │      │  │         │ no                              │  │
  │  preserves: HITL pause state │      │  │         ▼                                  │  │
  │                              │      │  │      FLUSHED (deleted from store)          │  │
  └──────────────────────────────┘      │  └────────────────────────────────────────────┘  │
                                        └──────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  MIDDLEWARE  (applied to every model call on every agent, on every branch)

  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                        │
  │  localLlmPromptMiddleware → memoryInjectionMiddleware → scratchpadContextMiddleware    │
  │    → focusedContextMiddleware → tokenBudgetMiddleware → toolCompatibilityMiddleware    │
  │                                                                                        │
  │  This stack is the hot memory enforcement boundary. Nothing enters the model's         │
  │  context window without passing through it. Context is trimmed, capped, and            │
  │  augmented here on every single call regardless of which node is executing.            │
  │                                                                                        │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Lifecycle State Machines

Each entity in the system has a defined lifecycle. The following sections document the valid states, transitions, and triggers for each.

### Thread Lifecycle

A thread represents a single conversation session between a user and the platform. Thread state is persisted by the checkpointer across turns and process restarts.

```
INITIALISING  →  READY  →  HYDRATING  →  PROCESSING  →  RESPONDING  →  READY
                                              ▲                │           │
                                              │ HITL resumes   │ paused    │ session ends
                                              └────────────────┘           ▼
                                                                          ENDED
```

| State | Description | Entry Trigger |
|---|---|---|
| `INITIALISING` | New thread — session hydration runs, cold → hot promotion for stable user context | No prior checkpointer state for `threadId` |
| `RESUMING` | Existing thread — hot memory restored from checkpoint | Prior state found for `threadId` |
| `READY` | Hot memory established, waiting for a message | Session or request hydration complete |
| `HYDRATING` | Request hydration running — query-matched cold memories being promoted | Message received |
| `PROCESSING` | Graph executing — skill match, routing, RLM, tool calls | Hydration complete |
| `RESPONDING` | Final answer produced — memories being authored, scratchpad being flushed | `finalAnswer` populated |
| `ENDED` | Session complete — scratchpad flushed, checkpoint preserved, LTM persists | Inactivity timeout or explicit close |

**HITL note:** A HITL interrupt transitions the thread from `PROCESSING` to a paused state within the checkpointer. It remains paused until resumed by a human decision. The transition policy for HITL timeout is a deferred deployment decision.

---

### Memory Entry Lifecycle

A memory entry is created by the `authorMemories` node and lives in the long-term cold store. Its importance score determines both retrieval priority and eventual pruning.

```
NEW  →  ACTIVE  →  DECAYING  →  PRUNED
                      ▲
                      │ rescued by retrieval
                      │ (importance reinforced)

ACTIVE (procedural only)  →  SKILL CANDIDATE
  when: importance >= 0.9 AND accessCount >= 5
```

| State | Description | Entry Trigger |
|---|---|---|
| `NEW` | Entry created with initial importance score | `authorMemories` node writes to store |
| `ACTIVE` | Entry is being retrieved and reinforced | Retrieved by request or session hydration |
| `DECAYING` | Entry has not been retrieved within the decay window | Decay job runs periodically |
| `PRUNED` | Entry deleted from store | Importance falls below minimum threshold |
| `SKILL CANDIDATE` | Procedural entry flagged for skill promotion | Importance ≥ 0.9 + accessCount ≥ 5 |

**Reinforcement:** Each retrieval increments `accessCount` and adds to `importance` (+0.1, capped at 1.0).

**Decay:** Periodic job multiplies `importance` by the decay factor (default 0.8) for entries not accessed within the decay window (default 7 days). Entries below the prune threshold (default 0.05) are deleted.

**Promotion:** Procedural memory entries that reach the skill candidate threshold are evaluated by the `skillAuthoringAgent` for promotion into the skill registry. The memory entry remains in the store independently — the skill has its own lifecycle.

---

### Skill Lifecycle

A skill begins as a pattern in procedural memory and may eventually be promoted to the community static registry. At every stage it can be deprecated if its success rate falls below a threshold.

```
PROCEDURAL MEMORY  →  LEARNED SKILL  →  STATIC SKILL
        ▲                   │                 │
        │                   └── DEPRECATED ◄──┘
        │                   (successRate < threshold)
        │
  reinforced on reuse
```

| State | Description | Entry Trigger |
|---|---|---|
| `PROCEDURAL MEMORY` | Pattern exists in cold store as a procedural memory entry with numbered steps | `maybeAuthorSkill` after successful LLM decomposition |
| `LEARNED SKILL` | Registered in `SkillRegistry` with `source: "learned"` | Procedural memory importance ≥ 0.9 + accessCount ≥ 5 |
| `STATIC SKILL` | Community-visible, versioned, reviewed | Community review approval OR human-authored directly |
| `DEPRECATED` | Removed from active registry; underlying procedural memory begins decaying | `successRate` falls below deprecation threshold |

**Matching participation:** Learned and static skills both participate in Stage 1 (keyword filter) and Stage 2 (LLM confirmation) matching. Procedural memory entries participate only in Stage 2 via the learned skill path.

**Tracking:** Every skill invocation records success or failure, updating `successRate = successfulUses / totalUses`. This score directly controls deprecation and surfacing priority.

**Open:** The community review process for `LEARNED → STATIC` promotion is a product decision. Options include manual review queues, automated quality gates, and community voting.

---

### Task Lifecycle

A task is the atomic unit of work in the RLM system. Tasks are created by either `applySkill` (from skill steps) or `decomposeNode` (from LLM decomposition), and executed by a leaf agent.

```
QUEUED  →  STAGED  →  EXECUTING  →  COMPLETE  →  AGGREGATED
                           │
                    ⚠ ERROR PATH
                    (retry / fail / report — policy deferred)

QUEUED  →  SPLIT INTO CHILD TASKS  (parent discarded, children re-enter QUEUED)
```

| State | Description | Entry Trigger |
|---|---|---|
| `QUEUED` | Task exists in `taskQueue[]` awaiting evaluation | Created by `applySkill` or `decomposeNode` split |
| `STAGED` | Task popped from queue, moved to `currentTask` | `decomposeNode` determines task is simple enough to execute |
| `EXECUTING` | `selectTools` has run, `leafAgent` is invoked | `selectToolsNode` completes |
| `COMPLETE` | Result stored in `results[]`, `currentTask` cleared | `leafAgent` returns final message |
| `AGGREGATED` | All sibling tasks complete, `aggregateNode` synthesises results | `taskQueue` empty + all results present |

**Split:** When `decomposeNode` determines a task is too complex, the task is discarded and replaced by 2–3 child tasks at `depth + 1`. Each child enters `QUEUED`. The parent is never marked `COMPLETE` — it is replaced rather than completed.

**Depth limit:** At `maxDepth`, tasks are forced to `STAGED` regardless of complexity assessment. This prevents infinite recursion.

**Error path:** The behaviour when a leaf agent returns an error or empty response is not yet defined. This includes retry limits, partial failure reporting to the aggregate node, and whether a failed task blocks siblings. This is a deferred decision.

---

### Scratchpad Entry Lifecycle

A scratchpad entry is created when a tool returns output that exceeds the interception threshold. It lives in the cold store for the duration of the session and is flushed when the session ends.

```
(tool output <= threshold)  →  PASS THROUGH  (no entry created)

(tool output > threshold)   →  WRITTEN  →  RETRIEVABLE  →  PRE-FLUSH  →  FLUSHED
                                                                │
                                                     promote to LTM? → yes → Long-Term Memory
```

| State | Description | Entry Trigger |
|---|---|---|
| `PASS THROUGH` | Output small enough to remain in ToolMessage directly | Output size ≤ `outputMaxChars` threshold |
| `WRITTEN` | Full content stored in cold store (chunked); summary + ref in hot index | Output size > threshold — `interceptToolOutput` runs |
| `RETRIEVABLE` | Available for on-demand retrieval via `scratchpad_read` tool | Entry exists in cold store |
| `PRE-FLUSH` | Session ending — index passed to `authorMemories` for LTM promotion decision | Session `RESPONDING` state entered |
| `FLUSHED` | Entry deleted from session store | `scratchpadFlush(sessionId)` called |

**Hot index:** The scratchpad index (ref + summary for all `WRITTEN` entries) is injected into every model call via `scratchpadContextMiddleware`. This is what keeps the scratchpad "hot" without putting full content in context.

**LTM promotion:** The `authorMemories` node receives the index (summaries only — never raw content) before flush. It decides which entries are worth writing to long-term memory. Raw content is never passed to the authoring agent — only summaries.

**Interrupted sessions:** The behaviour when a session is interrupted (process crash, HITL timeout) before `PRE-FLUSH` runs is a deferred deployment decision. Options include: flush on next session start, retain with TTL, or treat as lost.

---

## Memory Architecture

Memory is divided into two layers based on **retrieval cost and intent**, not content type.

### Hot Memory

Always present in the model's context window. Zero retrieval cost. The model sees this on every call without any explicit action.

```
┌──────────────────────────────────────────────────────────┐
│                       HOT MEMORY                         │
│                                                          │
│  Conversation history     — managed by checkpointer      │
│  Session-hydrated facts   — loaded once at thread start  │
│  Request-hydrated facts   — added per turn               │
│  Scratchpad index         — ref + summary per entry      │
└──────────────────────────────────────────────────────────┘
```

**Failure mode: context bloat.** Hot memory must be actively managed to stay within the model's context window. This is the middleware layer's primary responsibility.

### Cold Memory

Not seen by the model unless explicitly retrieved.

```
┌──────────────────────────────────────────────────────────┐
│                      COLD MEMORY                         │
│                                                          │
│  Long-term store                                         │
│    episodic    — what happened in past sessions          │
│    semantic    — stable facts about the user             │
│    procedural  — patterns and approaches that worked     │
│                                                          │
│  Scratchpad full content                                 │
│    — raw tool outputs, chunked and keyword-indexed       │
│    — retrieved on demand via scratchpad_read             │
└──────────────────────────────────────────────────────────┘
```

**Failure mode: information loss.** Cold memory that is never retrieved might as well not exist from the model's perspective.

### The Hot/Cold Boundary

The boundary is a **deployment policy**, not an architectural constant. It is tuned based on the context window size of the model in use, hardware constraints, and the nature of tasks being performed.

### Cold-to-Hot Promotion

| Mechanism | Who triggers it | When |
|---|---|---|
| **Session hydration node** | Graph — automatic | Once, at thread creation |
| **Request hydration node** | Graph — automatic | Every request, before routing |
| **Memory injection middleware** | Middleware — automatic | Every model call, from graph state |
| **`scratchpad_read` tool** | LLM — on demand | During reasoning, when detail is needed |

### Long-Term Memory Tiers

| Tier | Contains | Typical Retention |
|---|---|---|
| **Episodic** | What happened — past sessions, decisions made | Medium — decays over time |
| **Semantic** | Stable facts about the user and their context | Long — reinforced on reuse |
| **Procedural** | Patterns and approaches that worked well | Long — promotes to skills at threshold |

---

## Context Hydration

Hydration is the process of populating hot memory before the model is invoked. It is a two-phase process with distinct timing and scope.

### Session Hydration

Runs **once per thread**, at thread creation, before the first message is processed.

**Purpose:** Establish a stable baseline of user context that persists for the entire thread lifetime.

**What it loads:**
- Semantic memories — user preferences, communication style, persistent context
- A summary of the most recent prior session
- Top procedural patterns for this user

**What it does not load:**
- Specific past facts (too broad — loaded per request)
- Skills (handled by the skill matcher, not hydration)

### Request Hydration

Runs **before every request**, augmenting but never replacing the session layer.

**Process:**
1. Use the user's message as a retrieval query against cold storage
2. Score candidates: keyword relevance × importance weight
3. Pass candidates through a lightweight LLM filter to remove false positives
4. Inject surviving memories into graph state for middleware delivery

---

## Scratchpad

The scratchpad is a session-scoped working memory buffer. It solves the tool output problem: external tools often return far more content than a local model's context window can hold.

### Role in the Hot/Cold Model

The scratchpad spans both layers deliberately — it is a bridge mechanism, not a third memory category:

| Part | Layer | Content |
|---|---|---|
| **Index** | Hot — always injected | ref ID + one-line summary per entry |
| **Full content** | Cold — retrieved on demand | Raw tool output, chunked |

### Storage and Schema

Uses the same `InMemoryStore` primitive as long-term memory, namespaced by `threadId`.

```
ScratchpadRecord {
  ref:       string          — unique key and store identifier
  toolName:  string
  taskId:    string
  summary:   string          — injected into hot index
  chunks: [{
    index:    number
    content:  string         — ~800 chars per chunk
    keywords: string[]       — for targeted retrieval scoring
  }]
  createdAt: number
  sessionId: string
}
```

Graph state holds only `{ sessionId: string }` — a plain serializable reference, not the store instance. This is critical for checkpointer compatibility.

### On-Demand Retrieval

`scratchpad_read(ref, query)` is always available to every leaf agent. It scores chunks by keyword relevance against the query and returns the top 1–2 chunks only — never the full content.

---

## Skills System

Skills are named, reusable decomposition patterns for recognised categories of task.

### Static and Learned Skills

| Type | Source | Stability |
|---|---|---|
| **Static** | Human/community authored | High — reviewed before registration |
| **Learned** | Promoted from procedural memory | Growing — automatic at quality threshold |

### Skill Matching

```
Stage 1: Keyword pre-filter    (free — no LLM call)
  → eliminates skills with no keyword overlap
  → if no candidates: skip to router immediately

Stage 2: LLM confirmation      (one small LLM call)
  → confirms semantic match from candidate list
  → requires confidence ≥ 0.7

match found  →  applySkill (steps → task queue, decompose bypassed)
no match     →  router (LLM decompose as fallback)
```

### Skill Authoring and Promotion

After every successful LLM-decomposed execution, `maybeAuthorSkill` evaluates whether the pattern is worth keeping:

- **To procedural memory:** 2+ distinct steps, recognisable recurring task type, successful result
- **To static registry:** procedural memory importance ≥ 0.9, accessCount ≥ 5, community review

---

## Recursive Language Models (RLM)

### Purpose and Activation

RLM is the fallback decomposition strategy when no skill matches and the router classifies the request as complex. It is not the default — the majority of requests are handled without it.

### Decomposition Strategy

```
Task arrives
     │
     ▼
decomposeAgent: simple enough for one call?
     │
     ├── yes → STAGED → execute directly
     └── no  → split into 2–3 sub-tasks (depth + 1)
               each re-enters QUEUED
               max depth enforced (default 3)
               at max depth: force execute regardless
```

### Context Isolation

Each leaf agent receives only:
- Its specific task description
- Sibling task summaries (text only)
- The scratchpad index
- Injected long-term memories

It does not receive full conversation history or unrelated task results.

---

## Tool System

### Tool Registry

```typescript
RegisteredTool {
  tool:                 ClientTool
  description:          string        — used by tool selector
  tags:                 string[]      — e.g. ["web", "file", "code"]
  requiresConfirmation: boolean       — triggers HITL if true
  outputMaxChars:       number        — interception threshold
}
```

### Dynamic Tool Selection

A `toolSelectorAgent` runs before every leaf execution and selects only the tools relevant to the current task. A local model given 2 tool schemas performs materially better than the same model given 10.

### Tool Output Interception

```
output <= threshold  →  ToolMessage unchanged
output >  threshold  →  interceptToolOutput()
                          full content  → scratchpad cold store (WRITTEN)
                          summary + ref → ToolMessage (stays in context)
```

### Human-in-the-Loop (HITL)

Tools with `requiresConfirmation: true` trigger an interrupt before execution. The graph is paused. The caller receives tool name, arguments, description, and allowed decisions (`approve`, `edit`, `reject`). On resume the middleware routes accordingly.

---

## Middleware Layer

Middleware handles constraints on individual model calls. It has no routing authority and no knowledge of graph structure.

> **Middleware handles constraints. The graph handles coordination.**

### Middleware Stack (Execution Order)

```
Before each model call:
  1. localLlmPromptMiddleware      — brevity/focus instruction
  2. memoryInjectionMiddleware     — inject hot memories from graph state
  3. scratchpadContextMiddleware   — inject scratchpad index
  4. focusedContextMiddleware      — trim message history to fit window
  5. tokenBudgetMiddleware         — hard cap on message length
  6. toolCompatibilityMiddleware   — tool format reminder if tools present

After each model call:
  7. toolCompatibilityMiddleware   — recover malformed tool calls from text
```

---

## Agent Design

### Agent Roles

| Agent | Tools | Middleware | Purpose |
|---|---|---|---|
| `routerAgent` | ❌ | Token budget only | Classify request: simple or complex |
| `decomposeAgent` | ❌ | Full local stack | Decide: execute or split |
| `leafAgent` *(factory)* | ✅ | Full stack + tool middlewares | Execute one focused task |
| `aggregateAgent` | ❌ | Full local stack | Synthesise sub-task results |
| `memoryAuthoringAgent` | ❌ | Token budget only | Extract memories from exchanges |
| `memoryFilterAgent` | ❌ | Token budget only | Filter retrieved memories |
| `skillConfirmationAgent` | ❌ | Token budget only | Stage 2 skill matching |
| `skillAuthoringAgent` | ❌ | Token budget only | Evaluate decomposition for skill promotion |
| `toolSelectorAgent` | ❌ | Token budget only | Select tools per task |
| `summariserAgent` | ❌ | Token budget only | Summarise tool output for scratchpad |

### Leaf Agent Factory

A new leaf agent instance is created per task with only the tools and configuration relevant to that task:

```typescript
createLeafAgent(selectedTools, scratchpad):
  tools:      selected tools + scratchpad_read (always)
  middleware: full local stack
              + scratchpadContextMiddleware(scratchpad)
              + toolCompatibilityMiddleware (if tools present)
              + humanInTheLoopMiddleware (if any tool requiresConfirmation)
```

---

## Graph Orchestration

### State Schema

All fields are plain serializable values. No class instances in graph state.

```
RLMState {
  goal              string
  userRequest       string
  userId            string
  scratchpadRef     { sessionId: string }
  branch            "simple" | "complex" | null
  taskQueue         Task[]
  currentTask       Task | null
  results           TaskResult[]
  finalAnswer       string
  injectedMemories  string | null
  availableTools    RegisteredTool[]
  selectedTools     RegisteredTool[]
  matchedSkill      Skill | null
  decomposedBySkill boolean
  maxDepth          number
}
```

### Node Execution Order

```
START → sessionHydrate (new thread only) → extractMemories → matchSkill
  │
  ├── skill matched → applySkill → selectTools → execute → aggregate → authorMemories → END
  │
  └── no skill → router
                   ├── simple → selectToolsSimple → simpleExecute → authorMemories → END
                   └── complex → decompose ◄─────────────────────────────────┐
                                     │                                        │
                                 currentTask?  ── no ──────────────────────► │ (recurse)
                                     │ yes
                                     ▼
                                 selectTools → execute → aggregate
                                                             │
                                                         queue empty?
                                                             │ yes
                                                             ▼
                                                       authorMemories
                                                       + maybeAuthorSkill → END
```

### Session Persistence

The checkpointer provides:
- **Short-term memory** — conversation history across turns
- **Resumability** — survives process restarts
- **HITL support** — state frozen at interrupt, resumed on decision
- **State isolation** — each `thread_id` has independent state

---

## The Self-Improving Loop

```
Day 1 — new task type encountered:
  No skill match → LLM decomposes → executes
  → maybeAuthorSkill writes procedural memory

Day 3 — similar request arrives:
  Learned skill matches → steps loaded directly
  → no LLM decomposition → faster and more reliable
  → procedural memory reinforced

Day 14 — pattern used successfully many times:
  importance ≥ 0.9, accessCount ≥ 5
  → promoted to static skill registry
  → available to all users

Over time:
  More requests hit skills     → less LLM decomposition needed
  Richer memory per user       → more personalised responses
  Community skills grow        → platform capability grows
                                 independent of model size
```

---

## Deferred Decisions

### Structural Decisions

| Decision | Options |
|---|---|
| Cold memory storage backend | SQLite, Redis, PostgreSQL, vector DB, flat files |
| Hot memory token budget | Depends on model context window size |
| Cold-to-hot promotion scoring | Keyword, semantic similarity, recency, importance weighting |
| Session hydration policy | What to always load; how many items; recency window |
| Scratchpad eviction / TTL | Memory pressure vs. session length |
| Skill review and approval workflow | Manual queue, automated gates, community voting |
| Multi-agent coordination topology | Supervisor pattern, peer-to-peer, shared state |

### Transition Policies

These govern how entities move between states. They are configuration values, not architectural constants:

```
Memory:
  initial_importance:     episodic=0.5, semantic=0.6, procedural=0.7  (suggested defaults)
  decay_trigger:          time-based | session-based | access-count-based
  decay_window:           default 7 days
  decay_factor:           default 0.8 per cycle
  prune_threshold:        default 0.05
  rescue_on_retrieval:    true — retrieval halts decay and reinforces importance

Skills:
  learned_importance:     0.9  (threshold for registry promotion)
  learned_min_uses:       5
  deprecation_threshold:  successRate < 0.6

Scratchpad:
  intercept_threshold:    default 300 chars
  max_size:               unbounded within session (deployment decision)
  ltm_promotion:          decided by memory authoring agent per entry
  interrupted_session:    deferred — flush on next start | retain with TTL | treat as lost

Tasks:
  retry_limit:            deferred — default 1 suggested
  parallel_execution:     false (default) — parallelism support deferred
  error_reporting:        deferred — fail silently | report to aggregate | abort thread

Threads:
  session_timeout:        deferred — suggested default 30 minutes inactivity
  rehydration_gap:        deferred — re-run session hydration if gap > 1 hour
  hitl_timeout:           deferred — suggested default none (waits indefinitely)
  max_thread_lifetime:    deferred — deployment dependent
```

---

## Technology Stack

| Concern | Current Implementation | Swap Point |
|---|---|---|
| Agent creation | `createAgent`, `createMiddleware` from `langchain` | Any agent framework |
| Graph orchestration | `StateGraph` from `@langchain/langgraph` | Any state machine |
| Storage primitive | `InMemoryStore` from `@langchain/langgraph` | Any key-value store |
| Session persistence | `MemorySaver` checkpointer | Any persistent checkpointer |
| Local LLM runtime | `ChatOllama` | Any `BaseChatModel` |
| Schema validation | `zod` | Any schema library |
| Tool definition | `tool()` from `@langchain/core/tools` | Any tool interface |

Both long-term memory and scratchpad use the same `InMemoryStore` instance, separated by namespace. Switching to a persistent backend requires changing only the store instantiation.

---

## Closing Principle

> **Everything shown to the model is intentional, minimal, and justified for the task at hand. Everything else is stored, indexed, and made accessible only when the model asks for it.**

The platform is designed to improve over time — not because the underlying models improve, but because skills, memory, and community knowledge accumulate. A user's tenth session is materially better than their first. A community's hundredth skill is materially more capable than its tenth. This holds independent of any changes to the model.