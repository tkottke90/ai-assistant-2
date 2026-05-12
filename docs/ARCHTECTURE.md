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
    - [Memory Injection Scope](#memory-injection-scope)
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
    - [Skill Runtime Environments](#skill-runtime-environments)
      - [Per-Skill Isolation](#per-skill-isolation)
      - [Runtime Version](#runtime-version)
      - [Lockfiles](#lockfiles)
      - [Skill Prep](#skill-prep)
    - [Skill Health](#skill-health)
    - [Skill Authoring](#skill-authoring)
      - [Track 1 — Emergent (Automatic)](#track-1--emergent-automatic)
      - [Track 2 — Deliberate (Human)](#track-2--deliberate-human)
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
    - [Middleware Stack](#middleware-stack)
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
  - [Closing Principles](#closing-principles)

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
| **System state is not memory** | Authoritative platform state (skill availability, runtime health) is injected live — never accumulated in the memory system |

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
                    │  scope=general only      │
                    └─────────────┬───────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐             ┌─────────────────────────────┐
                    │      matchSkill          │             │  SKILL LIFECYCLE            │
                    │                         │             │                             │
                    │  Stage 1:               │             │  PROCEDURAL MEMORY          │
                    │    keyword pre-filter   │             │    │ importance rising       │
                    │    status=ready only    │             │    │ accessCount rising      │
                    │  Stage 2:               │             │    ▼ (>= 0.9, >= 5 uses)    │
                    │    LLM confirmation     │             │  LEARNED (soft SKILL.md)    │
                    │    confidence >= 0.7    │             │    │ no scripts              │
                    │                         │             │    ▼ (human dev workflow)   │
                    │  skill status block     │             │  CODIFIED (skill package)   │
                    │  injected from live     │             │    │ scripts + lockfile      │
                    │  index (not memory)     │             │    ▼ (review + stable)       │
                    └──────┬──────────────────┘             │  STATIC (community)         │
                           │                                │    │                         │
               ┌───────────┴───────────┐                   │    ├── success → maintained  │
          matched                  no match                 │    ├── prep fails → UNAVAILABLE
               │                       │                   │    ├── exec fails → DEGRADED  │
               ▼                       ▼                   │    └── rate < threshold →     │
        ┌─────────────┐         ┌─────────────┐            │        DEPRECATED            │
        │  applySkill  │         │   router    │            └─────────────────────────────┘
        │  load full   │         │ simple /    │
        │  SKILL.md    │         │ complex     │
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
                      │     │        │   │  simple?     │ │  │    │   → activate env       │
                      │     │        │   │     │        │ │  │    │   → execute in sandbox │
                      │     │        │   │     ▼        │ │  │    │   → zero LLM tokens    │
                      │     │        │   │  STAGED      │ │  │    │                        │
                      │     │        │   │  EXECUTING ──┼─┘  │    └── natural language     │
                      │     │        │   │  COMPLETE    │    │       → leaf agent (LLM)   │
                      │     │        │   └──────┬───────┘    │           │                 │
                      │     │        │          │            │    EXECUTING               │
                      └─────┼────────┘          │            │    COMPLETE                 │
                            │                   │            │       │ result → results[] │
                            └────────┬──────────┘            │    AGGREGATED              │
                                     │                       │                            │
                                     ▼                       │  ⚠ ERROR PATH              │
                          ┌─────────────────────┐            │    retry / fail / report    │
                          │      aggregate       │            │    (policy: deferred)       │
                          │                     │            └──────────────────────────────┘
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
                          │    yes → reinforce   │             │    │ scope assigned          │
                          │    no  → write soft  │             │    ▼ retrieved (scope=gen)  │
                          │    SKILL.md to       │             │  ACTIVE                     │
                          │    learned index     │             │    │ importance += 0.1       │
                          │                     │             │    │ accessCount++           │
                          │  skill failures →   │             │    ▼ not retrieved           │
                          │  episodic memory    │             │  DECAYING                   │
                          │  scope=authoring    │             │    │ importance *= 0.8       │
                          │  shared experience →│             │    ▼ below threshold         │
                          │  episodic memory    │             │  PRUNED                     │
                          │  scope=general      │             │                              │
                          └──────────┬──────────┘             │  procedural only:            │
                                     │                        │  importance >= 0.9           │
                                    END                       │  + accessCount >= 5          │
                                                              │    ▼                         │
                                                              │  → SKILL CANDIDATE           │
                                                              └──────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  STORAGE LAYER

  ┌─────────────────────────────┐       ┌──────────────────────────────────────────────────┐
  │     Long-Term Memory        │       │  Scratchpad                                      │
  │  namespace: [memory,userId] │       │  namespace: [scratchpad, threadId]               │
  │                             │       │                                                  │
  │  episodic  (general)────────┼──┐    │  ┌────────────────────────────────────────────┐  │
  │  episodic  (authoring)──────┼──┤    │  │  SCRATCHPAD ENTRY LIFECYCLE                │  │
  │  semantic  ─── retrieve ◄───┼──┼────┼──┤                                            │  │
  │  procedural ── inject ─────►┼──┘    │  │  tool/script call completes                │  │
  │                             │       │  │       │                                    │  │
  │  ◄── author (post-response) │       │  │  size <= threshold?                        │  │
  │  ◄── promote (from scratch) │       │  │    yes → PASS THROUGH                      │  │
  │                             │       │  │    no  ▼                                   │  │
  │  scope=general  → injected  │       │  │       WRITTEN                              │  │
  │  scope=authoring → internal │       │  │         │ full content → cold store        │  │
  │  scope=none → audit only    │       │  │         │ summary + ref → hot index        │  │
  │                             │       │  │         ▼                                  │  │
  │  [decay job — periodic]     │       │  │       RETRIEVABLE                          │  │
  │    importance *= 0.8        │       │  │    (LLM calls scratchpad_read)             │  │
  │    below threshold → PRUNED │       │  │         │                                  │  │
  └─────────────────────────────┘       │  │  session ends                              │  │
                                        │  │         ▼                                  │  │
                                        │  │     PRE-FLUSH                              │  │
  ┌──────────────────────────────┐      │  │    index → memory author                   │  │
  │     Checkpoint Store         │      │  │         ▼                                  │  │
  │  namespace: [thread,threadId]│      │  │  promote to LTM? ── yes ───────────────────┼──┼──► Long-Term Memory
  │                              │      │  │         │ no                              │  │
  │  conversation history        │      │  │         ▼                                  │  │
  │  graph state snapshots       │      │  │      FLUSHED                               │  │
  │  hot memory between nodes    │      │  └────────────────────────────────────────────┘  │
  │  persists: across turns      │      └──────────────────────────────────────────────────┘
  │  preserves: HITL pause state │
  └──────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │  Skill Package Store  (filesystem)                                                   │
  │                                                                                      │
  │  skills/                                                                             │
  │    email-inbox/               ← codified, JavaScript, node 20                       │
  │      SKILL.md                 ← runtime.language + runtime.version declared         │
  │      getEmails.js                                                                    │
  │      getEmails.test.js                                                               │
  │      package.json             ← manifest                                             │
  │      package-lock.json        ← lockfile ✅ required                                │
  │      node_modules/            ← per-skill isolated env (.gitignore)                 │
  │    email-label-ads/           ← inference-only, runtime: none                       │
  │      SKILL.md                                                                        │
  │    email-label-apply/         ← codified, Python 3.12                               │
  │      SKILL.md                                                                        │
  │      applyLabels.py                                                                  │
  │      applyLabels.test.py                                                             │
  │      pyproject.toml           ← manifest                                             │
  │      uv.lock                  ← lockfile ✅ required                                │
  │      .venv/                   ← per-skill isolated env (.gitignore)                 │
  │    email-workflow/            ← compositional, runtime: none                        │
  │      SKILL.md                                                                        │
  │    _learned/                  ← auto-generated soft skills                          │
  │      summarise-and-report-a1b2c3/                                                    │
  │        SKILL.md               ← natural language steps only                         │
  │                                                                                      │
  │  Skill Index (in-memory, rebuilt on startup from filesystem scan)                   │
  │    per skill: id, keywords, status, preparedAt, lastFailure,                        │
  │               consecutiveFailures, successRate, runtimeRequired                     │
  │    status: ready | unavailable | degraded | deprecated                              │
  │    ← authoritative source of truth for skill health                                 │
  │    ← never duplicated into the memory system                                        │
  └──────────────────────────────────────────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  MIDDLEWARE  (applied to every model call on every agent, on every branch)

  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                        │
  │  localLlmPromptMiddleware → memoryInjectionMiddleware → scratchpadContextMiddleware    │
  │    → skillStatusMiddleware → focusedContextMiddleware → tokenBudgetMiddleware          │
  │    → toolCompatibilityMiddleware                                                       │
  │                                                                                        │
  │  memoryInjectionMiddleware  — injects scope=general memories only                     │
  │  skillStatusMiddleware      — injects live skill index status block (not from memory) │
  │                                                                                        │
  │  Nothing enters the model's context window without passing through this stack.         │
  │                                                                                        │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Lifecycle State Machines

### Thread Lifecycle

```
INITIALISING  →  READY  →  HYDRATING  →  PROCESSING  →  RESPONDING  →  READY
                                              ▲                │           │
                                              │ HITL resumes   │ paused    │ session ends
                                              └────────────────┘           ▼
                                                                          ENDED
```

| State | Description | Entry Trigger |
|---|---|---|
| `INITIALISING` | New thread — session hydration runs | No prior checkpointer state |
| `RESUMING` | Existing thread — hot memory restored | Prior state found |
| `READY` | Hot memory established, waiting for message | Hydration complete |
| `HYDRATING` | Request hydration running | Message received |
| `PROCESSING` | Graph executing — skill match, routing, RLM, scripts | Hydration complete |
| `RESPONDING` | Final answer produced — memories authored, scratchpad flushed | `finalAnswer` populated |
| `ENDED` | Session complete | Inactivity timeout or explicit close |

---

### Memory Entry Lifecycle

```
NEW  →  ACTIVE  →  DECAYING  →  PRUNED
                      ▲
                      │ rescued by retrieval (scope=general only)

ACTIVE (procedural only)  →  SKILL CANDIDATE
  when: importance >= 0.9 AND accessCount >= 5
```

| State | Description | Entry Trigger |
|---|---|---|
| `NEW` | Created with initial importance and scope assigned | `authorMemories` node |
| `ACTIVE` | Being retrieved and reinforced | Retrieved during hydration |
| `DECAYING` | Not retrieved within decay window | Periodic decay job |
| `PRUNED` | Deleted | Importance below threshold |
| `SKILL CANDIDATE` | Procedural entry flagged for promotion | Importance ≥ 0.9 + accessCount ≥ 5 |

**Injection scope** controls where a memory entry is visible. See [Memory Injection Scope](#memory-injection-scope).

---

### Skill Lifecycle

```
PROCEDURAL MEMORY
      │
      │ importance >= 0.9 + accessCount >= 5
      ▼
LEARNED  (soft SKILL.md in _learned/, no scripts)
      │
      │ human development workflow
      ▼
CODIFIED  (SKILL.md + scripts + lockfile + tests)
      │
      │ community review
      ▼
STATIC  ──── prep fails ────► UNAVAILABLE
  │               ▲                │
  │               └── re-prep ─────┘
  │
  ├── exec fails repeatedly ──► DEGRADED
  │         ▲                       │
  │         └── failures resolve ───┘
  │
  └── successRate < threshold ──► DEPRECATED
```

| State | Description | Lockfile |
|---|---|---|
| `PROCEDURAL MEMORY` | Pattern in cold store | N/A |
| `LEARNED` | Soft SKILL.md in `_learned/` | Generated on first prep if scripts present |
| `CODIFIED` | Full skill package in `skills/` | ✅ Required |
| `STATIC` | Community-visible, versioned | ✅ Required |
| `UNAVAILABLE` | Prep failed — not matchable | N/A |
| `DEGRADED` | Matchable with warning — consecutive execution failures | N/A |
| `DEPRECATED` | Removed from active matching | N/A |

**`UNAVAILABLE` and `DEGRADED`** are tracked in the Skill Index only — never written to the memory system. The agent learns about them via the live skill status block injected by `skillStatusMiddleware`.

---

### Task Lifecycle

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
| `QUEUED` | In `taskQueue[]` | `applySkill`, `decomposeNode`, sub-skill resolution |
| `STAGED` | Popped to `currentTask` | Task is simple enough to execute |
| `RESOLVING` | Sub-skill steps pushed to queue | Step contains `skill:` reference |
| `SCRIPTING` | Environment activated, script executed | Step contains script reference |
| `LLM EXECUTING` | Leaf agent invoked | Step requires model reasoning |
| `COMPLETE` | Result in `results[]` | Any execution path returns |
| `AGGREGATED` | All siblings complete | `taskQueue` empty |

---

### Scratchpad Entry Lifecycle

```
(output <= threshold)  →  PASS THROUGH

(output > threshold)   →  WRITTEN  →  RETRIEVABLE  →  PRE-FLUSH  →  FLUSHED
                                                            │
                                               promote to LTM? → yes → Long-Term Memory
```

---

## Memory Architecture

### Hot Memory

```
┌──────────────────────────────────────────────────────────┐
│                       HOT MEMORY                         │
│                                                          │
│  Conversation history     — managed by checkpointer      │
│  Session-hydrated facts   — loaded once at thread start  │
│  Request-hydrated facts   — scope=general only           │
│  Scratchpad index         — ref + summary per entry      │
│  Skill status block       — live from index, not memory  │
└──────────────────────────────────────────────────────────┘
```

**Failure mode: context bloat.** Actively managed by middleware.

### Cold Memory

```
┌──────────────────────────────────────────────────────────┐
│                      COLD MEMORY                         │
│                                                          │
│  Long-term store                                         │
│    episodic (general)   — shared experiences, sessions   │
│    episodic (authoring) — operational failures, internal │
│    semantic             — stable user facts              │
│    procedural           — patterns that worked           │
│                                                          │
│  Scratchpad full content                                 │
└──────────────────────────────────────────────────────────┘
```

**Failure mode: information loss.**

### The Hot/Cold Boundary

A deployment policy, not an architectural constant. Tuned to context window size and hardware constraints.

### Cold-to-Hot Promotion

| Mechanism | Who | When |
|---|---|---|
| Session hydration | Graph — automatic | Once per thread |
| Request hydration | Graph — automatic | Every request |
| Memory injection middleware | Middleware | Every model call — `scope=general` only |
| Skill status middleware | Middleware | Every model call — live from index |
| `scratchpad_read` | LLM — on demand | During reasoning |

### Memory Injection Scope

Every memory entry carries an `injectionScope` that controls where it is visible. This is the mechanism that prevents operational failures from poisoning routing decisions while preserving shared experience.

| Scope | Injected into | Written by | Examples |
|---|---|---|---|
| `general` | All requests via middleware | `authorMemories` | User preferences, session summaries, shared experiences |
| `authoring` | Internal agents only | `authorMemories` | Skill execution failures, operational detail |
| `none` | Never injected | `authorMemories` | Audit trail entries |

**The critical rule:** System state is never written to the memory system at any scope. Skill availability, runtime health, and prep status live exclusively in the Skill Index and are injected live by `skillStatusMiddleware`.

**Shared experience vs. system state:**

```
System state (index only, never memory):
  "email-inbox is unavailable — node version mismatch"
  ← binary, authoritative, current, changes when fixed

Operational fact (scope=authoring, memory):
  "email-inbox script exited code 1 during task X"
  ← historical detail for skill authoring agents

Shared experience (scope=general, memory):
  "During the email session on 2026-05-06, the inbox skill
   was unavailable and the task was completed another way"
  ← narrative, past tense, authored at session end
```

The agent can recall shared experiences because they are `scope=general` episodic memories. It cannot be confused by stale availability claims because those are never written to memory at all.

### Long-Term Memory Tiers

| Tier | Scope | Contains | Retention |
|---|---|---|---|
| **Episodic** | `general` | Shared experiences, session narratives | Medium — decays |
| **Episodic** | `authoring` | Operational failures, execution detail | Medium — decays |
| **Semantic** | `general` | Stable user facts, preferences | Long — reinforced |
| **Procedural** | `general` | Patterns that worked | Long — promotes to skills |

---

## Context Hydration

### Session Hydration

Runs **once per thread**. Loads stable user context for the thread lifetime.

**Loads:** Semantic preferences, communication style, recent session summary, top procedural patterns.
**Does not load:** Specific past facts (per request), skills (skill matcher), skill status (live index).

### Request Hydration

Runs **before every request**, augmenting the session layer.

**Process:** Query cold store → score by keyword × importance → LLM filter → inject `scope=general` memories only into graph state.

---

## Scratchpad

Session-scoped buffer preventing large outputs from polluting the context window.

### Role in the Hot/Cold Model

| Part | Layer | Content |
|---|---|---|
| **Index** | Hot — always injected | ref + summary |
| **Full content** | Cold — on demand | Raw output, chunked ~800 chars |

### Storage and Schema

```
ScratchpadRecord {
  ref, toolName, taskId, summary,
  chunks: [{ index, content, keywords }],
  createdAt, sessionId
}
```

Graph state holds only `{ sessionId: string }` — never a class instance.

### On-Demand Retrieval

`scratchpad_read(ref, query)` returns top 1–2 keyword-scored chunks only.

---

## Skills System

Skills are **named, portable, self-contained packages** encoding reusable approaches to recognised task types.

### Skill Package Structure

```
skills/
│
├── email-inbox/                          ← codified (JavaScript, node 20)
│   ├── SKILL.md                          ← runtime.language + runtime.version
│   ├── getEmails.js
│   ├── getEmails.test.js
│   ├── package.json
│   └── package-lock.json                 ← lockfile ✅ required
│
├── email-label-ads/                      ← inference-only (runtime: none)
│   └── SKILL.md
│
├── email-label-apply/                    ← codified (Python 3.12)
│   ├── SKILL.md
│   ├── applyLabels.py
│   ├── applyLabels.test.py
│   ├── pyproject.toml
│   └── uv.lock                           ← lockfile ✅ required
│
├── email-workflow/                       ← compositional (runtime: none)
│   └── SKILL.md
│
└── _learned/                             ← auto-generated soft skills
    └── summarise-and-report-a1b2c3/
        └── SKILL.md
```

`node_modules/` and `.venv/` are build artefacts — generated by prep, excluded from version control.

### The SKILL.md Format

**YAML frontmatter:**

```yaml
---
name: Email Inbox Fetch
version: 1.0.0
description: Fetch emails from a user's inbox
keywords: [email, fetch, inbox, retrieve, gmail]
type: atomic
runtime:
  language: javascript    # javascript | python | bash | none
  version: "20"           # major.minor — patch managed by lockfile
                          # omit for bash (system bash only)
                          # omit for none
inputs:
  user:   { type: string, required: true }
  count:  { type: number, default: 100 }
---
```

**Step reference syntax:**

| Syntax | Execution path |
|---|---|
| `./script.js --arg {value}` | Direct script execution — zero LLM tokens |
| `skill:/skill-name` | Sub-skill resolution — steps pushed to task queue |
| Natural language | Leaf agent (LLM) |
| `{placeholder}` | Resolved from context before execution |

### Atomic Skills

Does one thing. May mix script steps and LLM steps — the ratio is the skill's design decision.

### Compositional Skills

Orchestrates other skills. No scripts, no runtime, no lockfile. Sub-skill resolution reuses the RLM task queue machinery — no special handling needed. `maxDepth` naturally prevents infinite nesting.

**The RLM system and the skill system are the same system.** Skills are pre-authored decompositions.

### Static and Learned Skills

| Type | Scripts | Lockfile | Reliability |
|---|---|---|---|
| **Learned** | ❌ | Generated on first prep | Variable |
| **Codified** | ✅ Tested | ✅ Committed | High |
| **Static** | ✅ Reviewed | ✅ Reviewed | Highest |

### Skill Matching

```
Stage 1: Keyword pre-filter
  → reads frontmatter index only (no LLM call)
  → excludes skills with status != "ready"
  → no candidates → router immediately

Stage 2: LLM confirmation
  → name + description + step summaries (not full SKILL.md)
  → confidence >= 0.7 required

match  →  applySkill (full SKILL.md loaded, steps typed and queued)
no match  →  router
```

### Skill Execution

**Script (zero LLM tokens)**
```
resolve {placeholders} → activate isolated env
  → execute in sandbox (stdout=result, stderr=diagnostics)
  → output → scratchpad if large, else direct
```

**Sub-skill**
```
load SKILL.md → push steps to queue (depth+1)
  → executes through normal RLM path
```

**LLM**
```
createLeafAgent(selectedTools, scratchpad)
  → full middleware stack applied
```

### Skill Runtime Environments

#### Per-Skill Isolation

Each codified skill with scripts gets its own isolated environment:
- **JavaScript** — `node_modules/` local to skill directory
- **Python** — `.venv/` local to skill directory

| What isolation costs | What isolation buys |
|---|---|
| Duplicate on-disk installs | No version conflicts between skills |
| More disk space per skill | Independent upgradeability |
| — | Safe deletion |
| — | Full reproducibility from lockfile |

Download duplication is mitigated by package manager caches (`~/.npm`, `~/.cache/pip`) — packages are downloaded once and installed from cache.

#### Runtime Version

The `runtime.version` field specifies the required major/minor version:

```yaml
runtime:
  language: javascript
  version: "20"         # >= 20.0.0 < 21.0.0
```

```yaml
runtime:
  language: python
  version: "3.12"       # >= 3.12.0 < 3.13.0
```

Patch version is not specified — the lockfile handles dependency reproducibility at that level. The runtime version field exists to catch platform/API incompatibilities, not dependency drift.

**Version mismatch behaviour:** Hard fail at prep time with a clear remediation message. Version managers (`nvm` for Node.js, `pyenv` for Python) are the supported mechanism for multi-version environments.

```
ERROR: runtime version mismatch
  skill requires: node 20.x
  platform has:   node 22.4.0
  install via nvm: nvm install 20
```

#### Lockfiles

The lockfile is the **reliability guarantee** of a codified skill — two installs from the same lockfile produce identical environments.

| Language | Accepted lockfiles |
|---|---|
| JavaScript | `package-lock.json` or `yarn.lock` — one per skill |
| Python | `uv.lock` or `poetry.lock` |
| Bash | None — system dependency checking only |

Platform installation always uses the lockfile. Re-resolution from the manifest is never performed.

#### Skill Prep

```
platform skill prepare <name>
  → reads runtime.language and runtime.version from SKILL.md
  → checks installed runtime version — hard fail on mismatch
  → verifies lockfile present (error if missing for codified/static)
  → installs from lockfile into per-skill isolated environment
  → marks skill status = "ready" in the Skill Index

platform skill prepare --all
  → preps all unprepared skills
  → skips runtime: none skills (no-op)
  → reports failures with remediation instructions
```

Unprepared skills are **discoverable but not matchable**. Stage 1 excludes `status != "ready"`.

### Skill Health

Skill health is tracked in the **Skill Index** — the authoritative source of truth. It is never written to the memory system.

```typescript
SkillIndexEntry {
  id, name, keywords, description, type,
  status:              "ready" | "unavailable" | "degraded" | "deprecated"
  preparedAt?:         number
  runtimeRequired?:    string        // "node 20.x"
  lastFailure?: {
    type:              "prep" | "execution"
    reason:            string
    occurredAt:        number
    runtimeFound?:     string        // "node 22.4.0"
  }
  consecutiveFailures: number        // resets on success
  successRate:         number        // 0.0–1.0
}
```

**State transitions:**

```
prep fails       →  status = "unavailable", lastFailure recorded
re-prep succeeds →  status = "ready", lastFailure cleared

execution fails  →  consecutiveFailures++, successRate updated
                    episodic memory written (scope=authoring)
                    if consecutiveFailures >= threshold → status = "degraded"

execution succeeds → consecutiveFailures = 0
                     if successRate recovers → status = "ready"

successRate < deprecation threshold → status = "deprecated"
```

**What gets written to memory on failure:**

```
scope=authoring (operational, internal agents only):
  "email-inbox script exited code 1 during task X.
   Error: ModuleNotFoundError — google-auth missing."

scope=general (shared experience, authored at session end):
  "During the email session on 2026-05-06, the inbox skill was
   unavailable. The task was completed using an alternative approach."
  ← authored by memoryAuthoringAgent, past tense, no availability claim
```

**What is never written to memory:**
- Current availability status
- Runtime version mismatch details
- Prep failure reasons

These live in the Skill Index only. `skillStatusMiddleware` injects the live status block into every model call — the agent is always aware of current availability without any memory being involved.

**The agent can recall shared experiences** involving skill failures because those are `scope=general` episodic memories authored at session end. It will not be confused by stale availability claims because those are never written to memory. If a skill has been fixed and re-prepped, the next request's status block reflects that immediately.

### Skill Authoring

#### Track 1 — Emergent (Automatic)

```
LLM decomposes successfully
  → maybeAuthorSkill: 2+ steps? recurring? success?
  → soft SKILL.md written to _learned/
  → runtime: none (no scripts, no version, no lockfile)
  → participates in future matching
```

#### Track 2 — Deliberate (Human)

```
1. IDENTIFY — mechanical vs. reasoning steps
2. BUILD    — write scripts, handle all nuance internally,
              write unit tests, generate lockfile
3. COMPOSE  — write SKILL.md with runtime.language + runtime.version,
              script refs, LLM steps, sub-skill refs
4. VERIFY   — unit tests, integration test, platform skill prepare,
              submit to community registry
```

### Skill Maturity Model

```
EMERGENT  → fully soft, LLM all steps, auto-generated
                │ human development workflow
CODIFIED  → tested scripts + LLM, lockfile committed,
            runtime version declared
                │ community review
VERIFIED  → community validated, successRate tracked,
            highest reliability
```

> **A skill gets more reliable as more of its mechanical steps become code. The LLM is reserved for what only a model can do.**

---

## Recursive Language Models (RLM)

### Purpose and Activation

Fallback when no skill matches and router classifies request as complex.

```
matchSkill → no match → router → "simple" → single leaf agent
                               → "complex" → RLM decomposition
```

### Decomposition Strategy

```
decomposeAgent: one focused call?
  yes → STAGED → execute
  no  → split 2–3 sub-tasks (depth+1), maxDepth enforced (default 3)
```

### Context Isolation

Each leaf agent receives: task description, sibling summaries (text only), scratchpad index, injected memories. Never receives full conversation history or unrelated task results.

---

## Tool System

### Platform Tools vs. Skill Scripts

| | Platform Tools | Skill Scripts |
|---|---|---|
| **Registration** | Central registry | Co-located with skill |
| **Scope** | Any agent | Owning skill only |
| **Selection** | `toolSelectorAgent` | Resolved from SKILL.md |
| **Dependencies** | Platform-managed | Per-skill isolated env |
| **Examples** | `web_search`, `read_file` | `getEmails.js`, `applyLabels.py` |

### Tool Registry

```typescript
RegisteredTool {
  tool, description, tags,
  requiresConfirmation: boolean,
  outputMaxChars:       number
}
```

### Dynamic Tool Selection

`toolSelectorAgent` selects only relevant platform tools per leaf task. Script steps bypass tool selection entirely.

### Tool Output Interception

```
output <= threshold  →  unchanged
output >  threshold  →  full content → scratchpad
                         summary + ref → message
```

Applies to both platform tool outputs and skill script outputs.

### Human-in-the-Loop (HITL)

`requiresConfirmation: true` triggers an interrupt. Graph pauses, resumes on `approve` / `edit` / `reject`.

---

## Middleware Layer

> **Middleware handles constraints. The graph handles coordination. Scripts handle deterministic work.**

Script execution bypasses middleware entirely — it only applies to LLM calls.

### Middleware Stack

```
Before each model call:
  1. localLlmPromptMiddleware      — brevity/focus instruction
  2. memoryInjectionMiddleware     — scope=general memories only
  3. skillStatusMiddleware         — live skill index status block
  4. scratchpadContextMiddleware   — scratchpad index
  5. focusedContextMiddleware      — trim history to fit window
  6. tokenBudgetMiddleware         — hard cap on message length
  7. toolCompatibilityMiddleware   — tool format reminder

After each model call:
  8. toolCompatibilityMiddleware   — recover malformed tool calls
```

**`skillStatusMiddleware`** injects a structured block sourced live from the Skill Index — not from memory. It replaces itself on every call, ensuring the model always sees current availability:

```
[system — skill status]
Available:   email-inbox, email-label-ads, email-label-apply, email-workflow
Unavailable: email-label-keyword (prep failed: python 3.12 required, 3.9 found)
```

---

## Agent Design

### Agent Roles

| Agent | Tools | Purpose |
|---|---|---|
| `routerAgent` | ❌ | Classify: simple or complex |
| `decomposeAgent` | ❌ | Decide: execute or split |
| `leafAgent` *(factory)* | ✅ | Execute one focused natural-language task |
| `aggregateAgent` | ❌ | Synthesise results |
| `memoryAuthoringAgent` | ❌ | Extract memories, assign scope, author shared experiences |
| `memoryFilterAgent` | ❌ | Filter retrieved memories |
| `skillConfirmationAgent` | ❌ | Stage 2 matching |
| `skillAuthoringAgent` | ❌ | Evaluate for skill promotion |
| `toolSelectorAgent` | ❌ | Select platform tools per task |
| `summariserAgent` | ❌ | Summarise large outputs |

**Script execution involves no agent.** Scripts run directly in a sandboxed environment.

### Leaf Agent Factory

```typescript
createLeafAgent(selectedTools, scratchpad):
  tools:      selected platform tools + scratchpad_read
  middleware: full stack + scratchpadContextMiddleware(scratchpad)
              + toolCompatibilityMiddleware (if tools)
              + humanInTheLoopMiddleware (if requiresConfirmation)
```

---

## Graph Orchestration

### State Schema

```
RLMState {
  goal, userRequest, userId,
  scratchpadRef:    { sessionId: string }
  branch:           "simple" | "complex" | null
  taskQueue:        Task[]
  currentTask:      Task | null
  results:          TaskResult[]
  finalAnswer:      string
  injectedMemories: string | null     — scope=general only
  availableTools:   RegisteredTool[]
  selectedTools:    RegisteredTool[]
  matchedSkill:     Skill | null
  decomposedBySkill: boolean
  maxDepth:         number
}

Task {
  id, description, parentId, depth,
  stepRef?:      string               — "./script" | "skill:/name" | undefined
  resolvedArgs?: Record<string, string>
  requiresLLM:   boolean
}
```

### Node Execution Order

```
START → sessionHydrate (new thread) → extractMemories → matchSkill
  │
  ├── matched → applySkill → resolveSteps → execute → aggregate → authorMemories → END
  │
  └── no match → router
                   ├── simple → selectTools → simpleExecute → authorMemories → END
                   └── complex → decompose ◄──────────────────────────────────┐
                                     │                                         │
                                 currentTask? ── no ──────────────────────── ►│
                                     │ yes
                                     ▼
                                 resolveStep
                                   ├── script    → activate env → sandbox → COMPLETE
                                   ├── sub-skill → push steps (depth+1) → QUEUED
                                   └── LLM       → selectTools → leafAgent → COMPLETE
                                                        │
                                                    aggregate → queue empty?
                                                        │ yes
                                                    authorMemories + maybeAuthorSkill → END
```

**`authorMemories` responsibilities:**
- Write `scope=general` memories for user preferences and session context
- Write `scope=authoring` memories for operational detail and skill failures
- Synthesise `scope=general` shared-experience episodic memories for sessions involving failures
- Never write skill availability or system state — these belong to the Skill Index

### Session Persistence

Checkpointer provides: conversation history across turns, process restart resumability, HITL pause/resume, per-`thread_id` isolation.

---

## The Self-Improving Loop

```
Day 1 — new task type:
  No skill match → LLM decomposes → executes
  → maybeAuthorSkill writes soft SKILL.md to _learned/

Next similar request:
  Learned skill matches → consistent decomposition
  → still LLM-executed but no re-decomposition needed

Community identifies pattern:
  Deliberate authoring: scripts written, lockfile committed,
  runtime version declared, unit tested, submitted

Verified skill deployed:
  Script steps deterministic — zero LLM tokens
  Runtime version pinned — consistent across deployments
  Lockfile committed — reproducible everywhere

Skill has a bad deploy (runtime mismatch):
  Skill index: status = unavailable
  skillStatusMiddleware: model informed via live status block
  Memory: shared-experience episodic written at session end
  Agent: can recall "we had trouble with that skill" but
         never claims it is still broken after fix

Skill fixed and re-prepped:
  Skill index: status = ready, lastFailure cleared
  Next request: model sees updated status block immediately
  No memory cleanup needed — system state was never in memory

Over time:
  More verified skills      → less LLM inference
  Lockfiles + version pins  → consistent across environments
  Shared experiences        → agent recalls history honestly
  System state in index     → agent never poisoned by stale facts
```

---

## Deferred Decisions

### Structural Decisions

| Decision | Options |
|---|---|
| Cold memory storage backend | SQLite, Redis, PostgreSQL, vector DB, flat files |
| Hot memory token budget | Depends on model context window |
| Cold-to-hot promotion scoring | Keyword, semantic similarity, recency, importance |
| Session hydration policy | What to load; item count; recency window |
| Scratchpad eviction / TTL | Memory pressure vs. session length |
| Skill review and approval workflow | Manual queue, automated gates, community voting |
| Script sandbox runtime | Node.js subprocess, Deno, Python venv, WASM |
| Script timeout and resource limits | Deployment dependent |
| Shared skill environments | Per-skill isolation (default) → shared per-language → content-addressable store |
| Multi-agent topology | Supervisor, peer-to-peer, shared state |

### Transition Policies

```
Memory:
  initial_importance:      episodic=0.5, semantic=0.6, procedural=0.7
  decay_window:            default 7 days
  decay_factor:            default 0.8 per cycle
  prune_threshold:         default 0.05
  rescue_on_retrieval:     true (scope=general only)

Skills:
  learned_importance:      0.9
  learned_min_uses:        5
  deprecation_threshold:   successRate < 0.6
  degraded_threshold:      consecutiveFailures >= 3 (suggested)

Scratchpad:
  intercept_threshold:     default 300 chars
  ltm_promotion:           memory authoring agent per entry
  interrupted_session:     deferred

Tasks:
  retry_limit:             deferred — 1 suggested
  parallel_execution:      false (default) — deferred
  error_reporting:         deferred

Threads:
  session_timeout:         deferred — 30 minutes suggested
  rehydration_gap:         deferred — 1 hour suggested
  hitl_timeout:            deferred — none (wait indefinitely)
  max_thread_lifetime:     deferred
```

---

## Technology Stack

| Concern | Current | Swap Point |
|---|---|---|
| Agent creation | `createAgent`, `createMiddleware` | Any agent framework |
| Graph orchestration | `StateGraph` (`@langchain/langgraph`) | Any state machine |
| Storage primitive | `InMemoryStore` | Any key-value store |
| Session persistence | `MemorySaver` | Any persistent checkpointer |
| Local LLM | `ChatOllama` | Any `BaseChatModel` |
| Schema validation | `zod` | Any schema library |
| Platform tool definition | `tool()` (`@langchain/core/tools`) | Any tool interface |
| JS skill runtime | Node.js subprocess (sandboxed) | Deno |
| Python skill runtime | uv + `.venv` | Poetry, pip-tools |
| Skill discovery | Filesystem scan of `skills/` | Database, registry service |
| Skill index | In-memory (rebuilt on startup) | Persistent store |

---

## Closing Principles

> **Everything shown to the model is intentional, minimal, and justified for the task at hand. Everything else is stored, indexed, and made accessible only when the model asks for it.**

> **Mechanical work is code. Reasoning work is inference. Skills are the boundary between the two.**

> **System state is never stored in memory. Shared experience always is. The agent recalls history honestly — it never confuses what happened with what is currently true.**