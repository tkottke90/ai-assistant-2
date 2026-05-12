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
    - [Skill Package Structure](#skill-package-structure)
    - [The SKILL.md Format](#the-skillmd-format)
    - [Atomic Skills](#atomic-skills)
    - [Compositional Skills](#compositional-skills)
    - [Static and Learned Skills](#static-and-learned-skills)
    - [Skill Matching](#skill-matching)
    - [Skill Execution](#skill-execution)
    - [Skill Authoring](#skill-authoring)
      - [Track 1 — Emergent (Automatic)](#track-1--emergent-automatic)
      - [Track 2 — Deliberate (Human Development Workflow)](#track-2--deliberate-human-development-workflow)
    - [Skill Maturity Model](#skill-maturity-model)
  - [Recursive Language Models (RLM)](#recursive-language-models-rlm)
    - [Purpose and Activation](#purpose-and-activation)
    - [Decomposition Strategy](#decomposition-strategy)
    - [Context Isolation](#context-isolation)
  - [Tool System](#tool-system)
    - [Platform Tools vs. Skill Scripts](#platform-tools-vs-skill-scripts)
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
| **Code over inference** | Mechanical, deterministic steps are expressed as tested scripts — not LLM reasoning |

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
                    │    reads SKILL.md       │             │    │ accessCount rising      │
                    │    frontmatter index    │             │    ▼ (>= 0.9, >= 5 uses)    │
                    │  Stage 2:               │             │  LEARNED (soft SKILL.md)    │
                    │    LLM confirmation     │             │    │ no scripts              │
                    │    confidence >= 0.7    │             │    │ useCount tracked        │
                    └──────┬──────────────────┘             │    │ successRate tracked     │
                           │                                │    ▼ (human dev workflow)   │
               ┌───────────┴───────────┐                   │  CODIFIED (skill package)   │
          matched                  no match                 │    │ scripts + SKILL.md      │
               │                       │                   │    │ unit tested             │
               ▼                       ▼                   │    ▼ (review + stable)       │
        ┌─────────────┐         ┌─────────────┐            │  STATIC (community)         │
        │  applySkill  │         │   router    │            │    │                         │
        │              │         │             │            │    ├── success → maintained  │
        │  load full   │         │ simple /    │            │    └── failure → DEPRECATED  │
        │  SKILL.md    │         │ complex     │            └─────────────────────────────┘
        │  steps →     │         └──────┬──────┘
        │  task queue  │                │
        └──────┬───────┘       ┌────────┴────────┐
               │           simple             complex
               │               │                 │
               │               ▼                 ▼
               │      ┌──────────────┐   ┌──────────────┐    ┌──────────────────────────────┐
               │      │ simpleExec   │   │  decompose   │    │  TASK LIFECYCLE              │
               │      │              │   │              │    │                              │
               │      │ selectTools  │   │  QUEUED      │    │  QUEUED                      │
               │      │ createLeaf   │   │  task popped │    │    │ in taskQueue[]          │
               │      │ Agent(tools, │   │     │        │    │    ▼ decomposeNode pops      │
               │      │  scratchpad) │   │  too complex?│    │  STAGED                     │
               └──────►     │        │   │     │yes     │    │    │                        │
                      │     │        │   │     ▼        │    │    ├── step ref skill:/xxx  │
                      │     │        │   │  split 2-3   │    │    │   → load sub-skill     │
                      │     │        │   │  child tasks │    │    │   → push steps to queue│
                      │     │        │   │  QUEUED ◄────┼─┐  │    │                        │
                      │     │        │   │     │        │ │  │    ├── step ref ./script.js │
                      │     │        │   │  simple?     │ │  │    │   → execute in sandbox │
                      │     │        │   │     │        │ │  │    │   → zero LLM tokens    │
                      │     │        │   │     ▼        │ │  │    │                        │
                      │     │        │   │  STAGED      │ │  │    └── natural language     │
                      │     │        │   │  EXECUTING ──┼─┘  │       → leaf agent (LLM)   │
                      │     │        │   │  COMPLETE    │    │           │                 │
                      │     │        │   └──────┬───────┘    │    EXECUTING               │
                      │     │        │          │            │    COMPLETE                 │
                      └─────┼────────┘          │            │       │ result → results[] │
                            │                   │            │    AGGREGATED              │
                            └────────┬──────────┘            │                            │
                                     │                       │  ⚠ ERROR PATH              │
                                     ▼                       │    retry / fail / report    │
                          ┌─────────────────────┐            │    (policy: deferred)       │
                          │      aggregate       │            └──────────────────────────────┘
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
                          │    no  → write soft  │             │  ACTIVE                     │
                          │    SKILL.md to       │             │    │ importance += 0.1       │
                          │    learned index     │             │    │ accessCount++           │
                          └──────────┬──────────┘             │    ▼ not retrieved           │
                                     │                        │  DECAYING                   │
                                    END                       │    │ importance *= 0.8       │
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

  ┌─────────────────────────────┐       ┌──────────────────────────────────────────────────┐
  │     Long-Term Memory        │       │  Scratchpad                                      │
  │  namespace: [memory,userId] │       │  namespace: [scratchpad, threadId]               │
  │                             │       │                                                  │
  │  episodic  ─────────────────┼──┐    │  ┌────────────────────────────────────────────┐  │
  │  semantic  ─── retrieve ◄───┼──┼────┼──┤  SCRATCHPAD ENTRY LIFECYCLE                │  │
  │  procedural ── inject ─────►┼──┘    │  │                                            │  │
  │                             │       │  │  tool/script call completes                │  │
  │  ◄── author (post-response) │       │  │       │                                    │  │
  │  ◄── promote (from scratch) │       │  │  size <= threshold?                        │  │
  │                             │       │  │    yes → PASS THROUGH                      │  │
  │  [decay job — periodic]     │       │  │    no  ▼                                   │  │
  │    importance *= 0.8        │       │  │       WRITTEN                              │  │
  │    below threshold → PRUNED │       │  │         │ full content → cold store        │  │
  │                             │       │  │         │ summary + ref → hot index        │  │
  └─────────────────────────────┘       │  │         ▼                                  │  │
                                        │  │       RETRIEVABLE                          │  │
                                        │  │    (LLM calls scratchpad_read)             │  │
  ┌──────────────────────────────┐      │  │         │                                  │  │
  │     Checkpoint Store         │      │  │  session ends                              │  │
  │  namespace: [thread,threadId]│      │  │         ▼                                  │  │
  │                              │      │  │     PRE-FLUSH                              │  │
  │  conversation history        │      │  │    index → memory author                   │  │
  │  graph state snapshots       │      │  │         ▼                                  │  │
  │  hot memory between nodes    │      │  │  promote to LTM? ── yes ───────────────────┼──┼──► Long-Term Memory
  │  persists: across turns      │      │  │         │ no                              │  │
  │  preserves: HITL pause state │      │  │         ▼                                  │  │
  └──────────────────────────────┘      │  │      FLUSHED                               │  │
                                        │  └────────────────────────────────────────────┘  │
                                        └──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │  Skill Package Store  (filesystem)                                                   │
  │                                                                                      │
  │  skills/                                                                             │
  │    email-inbox/          ← atomic skill                                              │
  │      SKILL.md            ← frontmatter index + LLM instructions                     │
  │      getEmails.js        ← co-located script (part of the skill)                    │
  │      getEmails.test.js   ← travels with the skill                                   │
  │    email-label-ads/      ← atomic skill, inference-only (no scripts)                │
  │      SKILL.md                                                                        │
  │    email-label-apply/    ← atomic skill                                              │
  │      SKILL.md                                                                        │
  │      applyLabels.js                                                                  │
  │      applyLabels.test.js                                                             │
  │    email-workflow/       ← compositional skill (references other skills)            │
  │      SKILL.md                                                                        │
  │                                                                                      │
  │  Skill Loader reads SKILL.md frontmatter to build the matcher index.                │
  │  Full SKILL.md content is loaded only when a skill is matched.                      │
  └──────────────────────────────────────────────────────────────────────────────────────┘

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

A thread represents a single conversation session. Thread state is persisted by the checkpointer across turns and process restarts.

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
| `PROCESSING` | Graph executing — skill match, routing, RLM, tool and script calls | Hydration complete |
| `RESPONDING` | Final answer produced — memories being authored, scratchpad being flushed | `finalAnswer` populated |
| `ENDED` | Session complete — scratchpad flushed, checkpoint preserved, LTM persists | Inactivity timeout or explicit close |

**HITL note:** A HITL interrupt transitions the thread from `PROCESSING` to a paused state within the checkpointer. It remains paused until resumed by a human decision.

---

### Memory Entry Lifecycle

```
NEW  →  ACTIVE  →  DECAYING  →  PRUNED
                      ▲
                      │ rescued by retrieval

ACTIVE (procedural only)  →  SKILL CANDIDATE
  when: importance >= 0.9 AND accessCount >= 5
```

| State | Description | Entry Trigger |
|---|---|---|
| `NEW` | Entry created with initial importance score | `authorMemories` node writes to store |
| `ACTIVE` | Entry is being retrieved and reinforced | Retrieved by request or session hydration |
| `DECAYING` | Entry not retrieved within decay window | Periodic decay job |
| `PRUNED` | Entry deleted from store | Importance falls below minimum threshold |
| `SKILL CANDIDATE` | Procedural entry flagged for skill promotion | Importance ≥ 0.9 + accessCount ≥ 5 |

**Reinforcement:** Each retrieval increments `accessCount` and adds to `importance` (+0.1, capped at 1.0).

**Decay:** Periodic job multiplies `importance` by the decay factor (default 0.8) for entries not accessed within the decay window (default 7 days).

**Promotion:** Procedural entries at the skill candidate threshold are evaluated by `skillAuthoringAgent` for promotion to a soft SKILL.md file. The memory entry remains in the store independently.

---

### Skill Lifecycle

Skills follow a maturity path from emergent procedural memory to community-verified codified packages.

```
PROCEDURAL MEMORY
      │
      │ importance >= 0.9 + accessCount >= 5
      ▼
LEARNED  (soft SKILL.md, no scripts)
      │
      │ human development workflow
      ▼
CODIFIED  (skill package: SKILL.md + co-located scripts + tests)
      │
      │ community review
      ▼
STATIC  (community registry)
      │
      ├── success sustained  →  maintained
      └── successRate < threshold  →  DEPRECATED
```

| State | Description | Entry Trigger |
|---|---|---|
| `PROCEDURAL MEMORY` | Pattern stored in cold memory with numbered steps | `maybeAuthorSkill` after LLM decomposition |
| `LEARNED` | Soft SKILL.md generated, no scripts, in learned index | Procedural memory crosses threshold |
| `CODIFIED` | Full skill package: SKILL.md + scripts + tests committed to skills directory | Human development workflow |
| `STATIC` | Community-visible, versioned, in community registry | Community review approval or direct human authoring |
| `DEPRECATED` | Removed from active matching; underlying memory decays | `successRate` below threshold |

**Two promotion tracks exist — they are independent:**

- `PROCEDURAL MEMORY → LEARNED` — automatic, driven by `maybeAuthorSkill`
- `LEARNED/PROCEDURAL → CODIFIED → STATIC` — deliberate human development workflow

A CODIFIED skill is always more reliable than a LEARNED skill because mechanical steps are expressed as tested scripts rather than LLM reasoning.

---

### Task Lifecycle

A task is the atomic unit of work in the RLM system. Tasks originate from skill steps (`applySkill`), LLM decomposition (`decomposeNode`), or sub-skill resolution.

```
QUEUED  →  STAGED  →  EXECUTING  →  COMPLETE  →  AGGREGATED
                │
                ├── step: skill:/xxx  →  RESOLVING  →  child tasks QUEUED
                ├── step: ./script    →  SCRIPTING  →  COMPLETE (zero LLM tokens)
                └── step: natural lang →  LLM EXECUTING  →  COMPLETE

QUEUED  →  SPLIT  (parent discarded, 2-3 children re-enter QUEUED)

⚠ ERROR PATH  (retry / fail / report — policy deferred)
```

| State | Description | Entry Trigger |
|---|---|---|
| `QUEUED` | Task in `taskQueue[]` | Created by `applySkill`, `decomposeNode`, or sub-skill resolution |
| `STAGED` | Popped to `currentTask`, execution path determined | `decomposeNode` — task is simple enough to execute |
| `RESOLVING` | Step references `skill:/xxx` — sub-skill loaded, steps pushed to queue | Step contains `skill:` reference |
| `SCRIPTING` | Step references `./script.js` — executed in sandbox, zero LLM tokens | Step contains script reference |
| `LLM EXECUTING` | Natural language step — leaf agent invoked | Step requires model reasoning |
| `COMPLETE` | Result in `results[]`, `currentTask` cleared | Any execution path returns |
| `AGGREGATED` | All sibling tasks complete, aggregate node synthesises | `taskQueue` empty |

**Depth limit:** At `maxDepth`, tasks are forced to `STAGED` regardless of complexity. Compositional skill resolution counts toward depth — preventing infinite nesting.

**Error path:** Behaviour when a script errors or a leaf agent returns empty is deferred. This includes retry limits, partial failure reporting, and whether a failed task blocks siblings.

---

### Scratchpad Entry Lifecycle

```
(output <= threshold)  →  PASS THROUGH  (no entry created)

(output > threshold)   →  WRITTEN  →  RETRIEVABLE  →  PRE-FLUSH  →  FLUSHED
                                                            │
                                               promote to LTM? → yes → Long-Term Memory
```

| State | Description | Entry Trigger |
|---|---|---|
| `PASS THROUGH` | Output stays in message directly | Size ≤ `outputMaxChars` |
| `WRITTEN` | Chunked in cold store, summary + ref in hot index | Size > threshold |
| `RETRIEVABLE` | Available via `scratchpad_read` | Entry exists in store |
| `PRE-FLUSH` | Session ending — index passed to `authorMemories` | Session `RESPONDING` state |
| `FLUSHED` | Deleted from session store | `scratchpadFlush(sessionId)` called |

Script outputs follow the same lifecycle as tool outputs — large script results are intercepted and scratchpadded automatically.

---

## Memory Architecture

Memory is divided into two layers based on **retrieval cost and intent**, not content type.

### Hot Memory

Always present in the model's context window. Zero retrieval cost.

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
│    — raw tool and script outputs, chunked                │
│    — retrieved on demand via scratchpad_read             │
└──────────────────────────────────────────────────────────┘
```

**Failure mode: information loss.** Cold memory that is never retrieved might as well not exist from the model's perspective.

### The Hot/Cold Boundary

The boundary is a **deployment policy**, not an architectural constant. It is tuned based on context window size, hardware constraints, and the nature of tasks being performed.

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

### Session Hydration

Runs **once per thread**, at thread creation. Loads stable user context into hot memory for the thread lifetime.

**What it loads:** Semantic preferences, communication style, summary of most recent session, top procedural patterns.

**What it does not load:** Specific past facts (loaded per request), skills (handled by the skill matcher).

### Request Hydration

Runs **before every request**, augmenting but never replacing the session layer.

**Process:** Query cold store with user message → score by keyword × importance → LLM filter for relevance → inject into graph state for middleware delivery.

---

## Scratchpad

The scratchpad is a session-scoped working memory buffer that prevents large tool and script outputs from polluting the LLM's context window.

### Role in the Hot/Cold Model

The scratchpad is a bridge mechanism — it spans both layers deliberately:

| Part | Layer | Content |
|---|---|---|
| **Index** | Hot — always injected | ref ID + one-line summary per entry |
| **Full content** | Cold — retrieved on demand | Raw output, chunked ~800 chars |

### Storage and Schema

Uses the same `InMemoryStore` as long-term memory, namespaced by `threadId`. Graph state holds only `{ sessionId: string }` — a plain serializable reference, never a class instance.

```
ScratchpadRecord {
  ref:       string          — unique key and store identifier
  toolName:  string          — tool or script that produced this
  taskId:    string
  summary:   string          — injected into hot index
  chunks: [{
    index:    number
    content:  string         — ~800 chars
    keywords: string[]
  }]
  createdAt: number
  sessionId: string
}
```

### On-Demand Retrieval

`scratchpad_read(ref, query)` is available to every leaf agent. It scores chunks by keyword relevance and returns the top 1–2 chunks — never the full content.

---

## Skills System

Skills are **named, portable, self-contained packages** that encode reusable approaches to recognised task types. They are the primary mechanism by which the platform improves over time and reduces reliance on LLM reasoning for known patterns.

### Skill Package Structure

Every skill is a directory on the filesystem. Scripts and tests travel with the skill — they are part of it, not separate platform dependencies.

```
skills/
  email-inbox/                ← atomic skill with scripts
    SKILL.md
    getEmails.js
    getEmails.test.js
  email-label-ads/            ← atomic skill, inference-only
    SKILL.md
  email-label-keyword/        ← atomic skill, inference-only
    SKILL.md
  email-label-apply/          ← atomic skill with scripts
    SKILL.md
    applyLabels.js
    applyLabels.test.js
  email-workflow/             ← compositional skill, no scripts
    SKILL.md
```

**Co-location is intentional.** A skill can be shared, versioned, reviewed, and tested as a single unit. There are no external tool registration dependencies.

**The Skill Loader** scans the skills directory on startup, reads `SKILL.md` frontmatter from each package to build the matcher index, and loads the full `SKILL.md` content only when a skill is matched. Scripts are loaded only when a step executes.

### The SKILL.md Format

Each `SKILL.md` file has two distinct sections serving two distinct purposes:

**YAML frontmatter** — machine-readable metadata for the skill matcher:

```yaml
---
name: Email Inbox Fetch
version: 1.0.0
description: Fetch emails from a user's inbox and return a structured list
keywords: [email, fetch, inbox, retrieve, messages, gmail]
type: atomic
inputs:
  user:
    type: string
    required: true
  count:
    type: number
    default: 100
---
```

**Markdown body** — human and LLM readable instructions for execution:

```markdown
# Email Inbox Fetch

Fetches emails from the specified user's inbox using the Gmail API.

## Steps

1. Execute `./getEmails.js --user {user} --count {count}`
2. The script returns a JSON array of email objects
3. Confirm the count and return the structured list

## Notes

- Authentication and pagination are handled by the script
- If the script fails, report the error — do not attempt to call the API directly
- `{user}` and `{count}` are resolved from the current context before execution
```

**Step reference syntax:**

| Syntax | Meaning | Execution path |
|---|---|---|
| `./script.js --arg {value}` | Execute co-located script | Direct execution — zero LLM tokens |
| `skill:/skill-name` | Invoke another skill | Sub-skill resolution — steps pushed to task queue |
| Natural language | LLM reasoning required | Leaf agent invocation |
| `{placeholder}` | Runtime value from context | Resolved before execution |

### Atomic Skills

An atomic skill does one thing. It may contain scripts for mechanical steps and natural language for reasoning steps. The mix is the skill's design decision.

```markdown
---
name: Email Label Apply
type: atomic
keywords: [email, label, apply, tag, gmail]
inputs:
  emails: { type: array, required: true }
  labels: { type: object, required: true }
---

## Steps

1. For each email in `{emails}`, determine which labels from `{labels}` apply
2. Execute `./applyLabels.js --data {labels_json}`
3. Confirm the labels were applied and return a summary
```

Step 1 uses LLM reasoning. Step 2 executes a script. Step 3 is a lightweight LLM confirmation. This is a **mixed skill** — reasoning where reasoning is needed, code where code is reliable.

### Compositional Skills

A compositional skill orchestrates other skills. It contains no scripts of its own — all complexity lives in the referenced atomic skills.

```markdown
---
name: Email Processing Workflow
version: 1.0.0
description: Fetch and intelligently label all emails in a user's inbox
keywords: [email, process, workflow, label, organise, inbox]
type: compositional
skills:
  - /email-inbox
  - /email-label-ads
  - /email-label-keyword
  - /email-label-apply
---

# Email Processing Workflow

## Steps

1. `skill:/email-inbox` — Fetch 100 emails from the user's inbox
2. `skill:/email-label-ads` — Identify which emails are advertisements
3. `skill:/email-label-keyword` — Extract keyword-based labels from remaining emails
4. `skill:/email-label-apply` — Apply all identified labels back to the inbox

## Context Passing

- The output of each step is available to subsequent steps
- Steps 2 and 3 receive the email list produced by step 1
- Step 4 receives the label assignments produced by steps 2 and 3
```

**Compositional skills reuse the RLM task queue without special handling.** When the executor encounters `skill:/email-inbox`, it loads that skill's `SKILL.md`, pushes its steps onto the task queue at `depth + 1`, and those tasks execute through the normal path. The RLM `maxDepth` limit naturally prevents infinite nesting.

This means the RLM system and the skill system are the same system. Skills are pre-authored decompositions. Compositional skills are pre-authored recursive decompositions. The execution machinery is identical.

### Static and Learned Skills

| Type | Source | Scripts | Reliability |
|---|---|---|---|
| **Learned (soft)** | Auto-generated from procedural memory | ❌ None | Variable — LLM executes all steps |
| **Codified** | Human development workflow | ✅ Co-located, tested | High — mechanical steps are deterministic |
| **Static (community)** | Community reviewed and registered | ✅ Reviewed and tested | Highest — community validated |

### Skill Matching

Matching uses the frontmatter index — the full `SKILL.md` body is never loaded until a match is confirmed:

```
Stage 1: Keyword pre-filter    (free — reads frontmatter index only)
  → matches request keywords against skill `keywords` arrays
  → if no candidates: proceed to router immediately

Stage 2: LLM confirmation      (one small LLM call)
  → LLM receives skill name + description + step list (not full SKILL.md)
  → requires confidence ≥ 0.7 to confirm match

match found  →  applySkill
  → full SKILL.md loaded
  → steps parsed
  → execution path determined per step (script / sub-skill / LLM)
  → steps added to task queue

no match     →  router (LLM decompose as fallback)
```

### Skill Execution

Each step in a matched skill is resolved to one of three execution paths before being added to the task queue:

**Script execution (zero LLM tokens)**
```
step: "Execute ./getEmails.js --user {user} --count {count}"
     │
     ▼
resolve {placeholders} from current context
     │
     ▼
execute script in sandbox
     │
     ▼
output → scratchpad (if large) or direct to results
```

**Sub-skill resolution**
```
step: "skill:/email-label-ads"
     │
     ▼
load sub-skill SKILL.md
     │
     ▼
push sub-skill steps to task queue (depth + 1)
     │
     ▼
sub-skill executes through normal RLM path
results flow back up through aggregate node
```

**LLM reasoning (leaf agent)**
```
step: "Identify which emails are advertisements"
     │
     ▼
createLeafAgent(selectedTools, scratchpad)
     │
     ▼
agent invoked with step description + context
full middleware stack applied
```

### Skill Authoring

Two distinct tracks produce skills. They are independent and serve different purposes.

#### Track 1 — Emergent (Automatic)

```
LLM decomposes a request successfully
     │
     ▼
maybeAuthorSkill evaluates:
  - 2+ distinct steps?
  - Recognisable, recurring task type?
  - Successful result?
     │
     ▼ yes
Soft SKILL.md generated (natural language only, no scripts)
Written to learned index
Participates in future skill matching
```

Emergent skills are soft skills. Every step is a natural language description executed by a leaf agent. They are a starting point, not a final state.

#### Track 2 — Deliberate (Human Development Workflow)

```
1. IDENTIFY
   For each step in an emergent or known skill pattern:

   Mechanical (script candidate):          Reasoning (stays as LLM step):
   - Calls external API                    - Interprets ambiguous intent
   - Transforms data deterministically     - Makes judgement calls
   - Reads / writes files or databases     - Synthesises conclusions
   - Follows a fixed decision tree         - Handles unexpected inputs

2. BUILD
   For each mechanical step:
   - Write the script (JS / Python / Bash)
   - Handle all procedural nuance internally
     (auth, retry, pagination, error handling, edge cases)
   - Write unit tests — the reliability guarantee
   - Co-locate with the skill package

3. COMPOSE
   Write the SKILL.md:
   - Hard steps: reference script by path with {placeholder} args
   - Soft steps: natural language description for LLM execution
   - Compositional steps: reference sub-skills by skill:/name
   - Document which inputs are required vs. optional

4. VERIFY
   - Hard steps: covered by co-located unit tests
   - Soft steps: eval against representative inputs
   - Full skill: integration test end-to-end
   - Submit to community registry for review
```

### Skill Maturity Model

```
EMERGENT    — fully soft, LLM handles all steps
                  variable reliability, model-dependent
                  emerges automatically from maybeAuthorSkill
                        │
                        │ community identifies repeatable pattern
                        ▼
CODIFIED    — mix of tested scripts + LLM reasoning steps
                  mechanical nuance lives in code
                  scripts unit tested independently of LLM
                  materially more reliable than emergent
                        │
                        │ community review + validation
                        ▼
VERIFIED    — community reviewed, integration tested
                  successRate tracked across all users
                  the platform's highest-reliability execution path
```

The fundamental principle of the maturity model:

> **A skill gets more reliable as more of its mechanical steps become code. The LLM is reserved for what only a model can do — interpretation, judgement, and synthesis.**

---

## Recursive Language Models (RLM)

### Purpose and Activation

RLM is the fallback decomposition strategy when no skill matches and the router classifies the request as complex. It is not the default — simple requests and skill-matched requests never involve it.

```
matchSkill → no match
     │
     ▼
router → "simple"  →  single leaf agent call
       → "complex" →  RLM decomposition
```

### Decomposition Strategy

```
Task arrives
     │
     ▼
decomposeAgent: simple enough for one focused call?
     │
     ├── yes → STAGED → resolve execution path → execute
     └── no  → split into 2–3 sub-tasks (depth + 1)
               each re-enters QUEUED
               maxDepth enforced (default 3)
               at maxDepth: force execute
```

### Context Isolation

Each leaf agent receives only:
- Its specific task description
- Sibling task summaries (text only, not full outputs)
- The scratchpad index (refs + summaries)
- Injected long-term memories (via middleware)

It does not receive full conversation history or unrelated task results. This isolation is what keeps each call within the local model's context budget.

---

## Tool System

### Platform Tools vs. Skill Scripts

The platform distinguishes between two kinds of executable capability:

| | Platform Tools | Skill Scripts |
|---|---|---|
| **Registration** | Central tool registry | Co-located with skill package |
| **Portability** | Platform-dependent | Self-contained — travels with skill |
| **Scope** | Available to any agent | Available only within the skill |
| **Selection** | `toolSelectorAgent` per task | Resolved from SKILL.md step reference |
| **Examples** | `web_search`, `read_file`, `run_code` | `getEmails.js`, `applyLabels.py` |

Skill scripts handle nuance that is specific to the skill (authentication, API specifics, retry logic). Platform tools handle general-purpose capabilities available to any agent or leaf task.

### Tool Registry

```typescript
RegisteredTool {
  tool:                 ClientTool
  description:          string        — used by tool selector
  tags:                 string[]      — e.g. ["web", "file", "code"]
  requiresConfirmation: boolean       — triggers HITL if true
  outputMaxChars:       number        — scratchpad interception threshold
}
```

### Dynamic Tool Selection

A `toolSelectorAgent` runs before every leaf agent execution and selects only the tools relevant to the current natural-language task. Script steps bypass tool selection entirely — the script is already specified in the SKILL.md step.

### Tool Output Interception

Both tool outputs and script outputs are subject to scratchpad interception:

```
output <= threshold  →  message unchanged, stays in context
output >  threshold  →  intercepted
                          full content  → scratchpad cold store (WRITTEN)
                          summary + ref → message (stays in context)
```

### Human-in-the-Loop (HITL)

Platform tools with `requiresConfirmation: true` trigger a HITL interrupt before execution. Skill scripts that perform sensitive operations (file writes, external API mutations) should also set this flag in their SKILL.md frontmatter. The graph pauses and resumes on human decision (`approve`, `edit`, `reject`).

---

## Middleware Layer

Middleware handles constraints on individual model calls. It has no routing authority and no knowledge of graph structure. Script execution steps bypass the middleware stack entirely — middleware only applies to LLM calls.

> **Middleware handles constraints. The graph handles coordination. Scripts handle deterministic work.**

### Middleware Stack (Execution Order)

```
Before each model call:
  1. localLlmPromptMiddleware      — brevity/focus instruction for local models
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
| `leafAgent` *(factory)* | ✅ | Full stack + tool middlewares | Execute one focused natural-language task |
| `aggregateAgent` | ❌ | Full local stack | Synthesise sub-task results |
| `memoryAuthoringAgent` | ❌ | Token budget only | Extract memories from exchanges |
| `memoryFilterAgent` | ❌ | Token budget only | Filter retrieved memories |
| `skillConfirmationAgent` | ❌ | Token budget only | Stage 2 skill matching |
| `skillAuthoringAgent` | ❌ | Token budget only | Evaluate decomposition for skill promotion |
| `toolSelectorAgent` | ❌ | Token budget only | Select platform tools per natural-language task |
| `summariserAgent` | ❌ | Token budget only | Summarise large tool/script outputs for scratchpad |

**Script execution does not involve any agent.** Scripts run directly in a sandbox. Only natural-language steps require a leaf agent.

### Leaf Agent Factory

A new leaf agent instance is created per natural-language task step:

```typescript
createLeafAgent(selectedTools, scratchpad):
  tools:      selected platform tools + scratchpad_read (always)
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

Task {
  id:             string
  description:    string
  parentId:       string | null
  depth:          number
  stepRef?:       string    — "./script.js --args" | "skill:/name" | undefined
  resolvedArgs?:  Record<string, string>  — placeholders resolved from context
  requiresLLM:    boolean
}
```

### Node Execution Order

```
START → sessionHydrate (new thread only) → extractMemories → matchSkill
  │
  ├── skill matched → applySkill → resolveSteps → execute → aggregate → authorMemories → END
  │                       │
  │              per step: script / sub-skill / LLM
  │
  └── no skill → router
                   ├── simple → selectToolsSimple → simpleExecute → authorMemories → END
                   └── complex → decompose ◄─────────────────────────────────────┐
                                     │                                            │
                                 currentTask?  ── no ──────────────────────────► │
                                     │ yes
                                     ▼
                                 resolveStep
                                     ├── script  → sandbox execute → COMPLETE
                                     ├── sub-skill → push steps to queue (depth+1)
                                     └── LLM → selectTools → createLeafAgent → COMPLETE
                                                   │
                                               aggregate
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
  → maybeAuthorSkill writes soft SKILL.md to learned index

Day 3 — similar request arrives:
  Learned skill matches → steps loaded directly
  → some steps still LLM-executed (soft skill)
  → faster than full decomposition, more consistent

Community identifies the pattern:
  Developer runs deliberate authoring workflow:
    - Mechanical steps become co-located scripts with unit tests
    - SKILL.md updated to reference scripts
    - Submitted to community registry

Verified skill replaces learned skill:
  Same trigger keywords → now matches at Stage 1
  Script steps execute deterministically — zero LLM tokens
  LLM only invoked for genuine reasoning steps
  Reliability materially higher than learned version

Over time:
  More requests hit verified skills   → less LLM inference
  Skill library grows                 → platform capability grows
  Scripts are testable                → reliability is measurable
  Community contribution is concrete  → shared functions, not prompts
```

---

## Deferred Decisions

### Structural Decisions

| Decision | Options |
|---|---|
| Cold memory storage backend | SQLite, Redis, PostgreSQL, vector DB, flat files |
| Hot memory token budget | Depends on model context window |
| Cold-to-hot promotion scoring | Keyword, semantic similarity, recency, importance |
| Session hydration policy | What to always load; item count; recency window |
| Scratchpad eviction / TTL | Memory pressure vs. session length |
| Skill review and approval workflow | Manual queue, automated gates, community voting |
| Script sandbox runtime | Node.js subprocess, Deno, Python venv, WASM |
| Script timeout and resource limits | Deployment dependent |
| Multi-agent coordination topology | Supervisor pattern, peer-to-peer, shared state |

### Transition Policies

Configuration values — not architectural constants:

```
Memory:
  initial_importance:     episodic=0.5, semantic=0.6, procedural=0.7
  decay_trigger:          time-based | session-based | access-count-based
  decay_window:           default 7 days
  decay_factor:           default 0.8 per cycle
  prune_threshold:        default 0.05
  rescue_on_retrieval:    true

Skills:
  learned_importance:     0.9
  learned_min_uses:       5
  deprecation_threshold:  successRate < 0.6

Scratchpad:
  intercept_threshold:    default 300 chars
  ltm_promotion:          decided by memory authoring agent per entry
  interrupted_session:    deferred — flush on next start | retain with TTL | treat as lost

Tasks:
  retry_limit:            deferred — 1 suggested
  parallel_execution:     false (default) — parallelism deferred
  error_reporting:        deferred — silent | report to aggregate | abort

Threads:
  session_timeout:        deferred — 30 minutes inactivity suggested
  rehydration_gap:        deferred — re-run session hydration if gap > 1 hour
  hitl_timeout:           deferred — none suggested (wait indefinitely)
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
| Platform tool definition | `tool()` from `@langchain/core/tools` | Any tool interface |
| Skill script runtime | Node.js subprocess (sandboxed) | Deno, Python, Bash, WASM |
| Skill package discovery | Filesystem scan of `skills/` directory | Database, registry service |

Both long-term memory and scratchpad use the same `InMemoryStore` instance, separated by namespace. Switching to a persistent backend requires changing only the store instantiation.

---

## Closing Principle

> **Everything shown to the model is intentional, minimal, and justified for the task at hand. Everything else is stored, indexed, and made accessible only when the model asks for it.**

> **Mechanical work is code. Reasoning work is inference. Skills are the boundary between the two.**

The platform improves over time not because models improve, but because skills, memory, and community knowledge accumulate. A verified skill is more reliable than a learned one. A learned skill is more efficient than LLM decomposition. A community's skill library is an asset that outlasts any individual model generation.