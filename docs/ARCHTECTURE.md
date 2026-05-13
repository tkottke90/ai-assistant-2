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
    - [Memory Injection](#memory-injection)
    - [Long-Term Memory Tiers](#long-term-memory-tiers)
  - [Context Hydration](#context-hydration)
    - [Session Hydration](#session-hydration)
    - [Request Hydration](#request-hydration)
  - [Scratchpad](#scratchpad)
    - [Role in the Hot/Cold Model](#role-in-the-hotcold-model)
    - [Storage and Schema](#storage-and-schema)
    - [On-Demand Retrieval](#on-demand-retrieval)
    - [Scratchpad Budget Policy](#scratchpad-budget-policy)
  - [Skills System](#skills-system)
    - [Skill Package Structure](#skill-package-structure)
    - [The SKILL.md Format](#the-skillmd-format)
    - [Output Contract](#output-contract)
      - [Exit Codes](#exit-codes)
      - [Output Schema](#output-schema)
    - [Atomic Skills](#atomic-skills)
    - [Compositional Skills](#compositional-skills)
    - [Static and Learned Skills](#static-and-learned-skills)
    - [Skill Matching](#skill-matching)
    - [Skill Execution](#skill-execution)
    - [Skill Runtime Environment](#skill-runtime-environment)
      - [JavaScript — Node.js (Isolated)](#javascript--nodejs-isolated)
      - [Runtime Version](#runtime-version)
      - [Skill Prep](#skill-prep)
    - [Skill Configuration and Secrets](#skill-configuration-and-secrets)
      - [The Contract](#the-contract)
      - [Config vs. Secrets](#config-vs-secrets)
      - [Type Vocabulary](#type-vocabulary)
    - [Skill Health](#skill-health)
    - [Skill Authoring](#skill-authoring)
    - [Skill Maturity](#skill-maturity)
  - [Security Surface](#security-surface)
    - [Script Sandbox Constraints](#script-sandbox-constraints)
    - [Supply Chain](#supply-chain)
    - [Deferred Security Concerns](#deferred-security-concerns)
  - [Recursive Language Models (RLM)](#recursive-language-models-rlm)
    - [What RLMs Are](#what-rlms-are)
    - [The Problem: Context Rot](#the-problem-context-rot)
    - [Mechanism: REPL Environment](#mechanism-repl-environment)
    - [REPL Primitive API](#repl-primitive-api)
    - [REPL Execution Environment](#repl-execution-environment)
    - [REPL ↔ Scratchpad, Tools, and Skills](#repl--scratchpad-tools-and-skills)
    - [REPL Session Lifecycle](#repl-session-lifecycle)
    - [REPL Limits and Cleanup](#repl-limits-and-cleanup)
    - [REPL Cell Errors](#repl-cell-errors)
    - [Recursive Depth](#recursive-depth)
    - [Emergent Interaction Strategies](#emergent-interaction-strategies)
    - [RLMs vs. Agents](#rlms-vs-agents)
    - [Activation](#activation)
    - [Validation Gate](#validation-gate)
    - [Performance Characteristics](#performance-characteristics)
    - [Limitations](#limitations)
    - [How RLMs Fit into the Platform](#how-rlms-fit-into-the-platform)
  - [Tool System](#tool-system)
    - [Platform Tools vs. Skill Scripts](#platform-tools-vs-skill-scripts)
    - [Tool Registry](#tool-registry)
    - [Tag-Based Tool Selection](#tag-based-tool-selection)
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
  - [Deferred Decisions](#deferred-decisions)
    - [Structural Decisions](#structural-decisions)
    - [Transition Policies](#transition-policies)
  - [Technology Stack](#technology-stack)
  - [Closing Principles](#closing-principles)

---

## Overview

This document describes the architecture of a **Local-First, Autonomous LLM Agent Platform** — a system that supports AI agents working independently and collaboratively on tasks, operating primarily on local, resource-constrained language models in the 8B parameter class (Llama 3.2 / Ollama).

The platform is designed to make 8B models maximally useful through infrastructure rather than model scale. The key differentiator is the **Recursive Language Model (RLM)** system — a REPL-based mechanism that lets small models reason accurately over large contexts by querying them selectively, never loading the full context into a single prompt.

Local models present two hard constraints that every architectural decision is designed around:

- **Small context windows** — the model can only reason over a limited amount of text at once
- **Limited reasoning capacity** — complex multi-step planning degrades quickly without support

The platform addresses both constraints without sacrificing capability by keeping the model's context deliberately small and focused, and by offloading planning, memory, and tool management to the surrounding infrastructure.

---

## Core Design Principles

> **The model only ever operates on what it currently needs. Everything else is stored, indexed, and retrieved on demand.**

| Principle | Description |
|---|---|
| **Local-first** | Every design decision prioritizes small, focused context windows suitable for constrained hardware |
| **Intentional context** | Nothing enters the model's context window by accident — every item is justified for the current task |
| **Separation of concerns** | Middleware handles constraints; the graph handles coordination; agents handle execution |
| **Progressive complexity** | Simple requests are handled cheaply; complexity is added only when the task demands it |
| **Implementation-agnostic** | Architectural commitments are to principles, not specific backends or storage technologies |
| **Community extensibility** | Skills and tools are first-class contribution surfaces |
| **Code over inference** | Mechanical, deterministic steps are expressed as tested scripts — not LLM reasoning |
| **System state is not memory** | Authoritative platform state (skill availability, runtime health) is injected live — never accumulated in the memory system |
| **Skills trust the platform** | Skills declare what they need; the platform satisfies it. Skills never manage credentials or configuration directly |

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
                    │  relevance threshold cut │             └─────────────────────────────┘
                    │  → injectedMemories      │
                    │  all types injectable    │
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
                    │    rank candidates      │             │  LEARNED (soft SKILL.md)    │
                    │    LLM confirms top     │             │    │ no scripts              │
                    │    confidence >= 0.7    │             │    ▼ (human dev workflow)   │
                    │                         │             │  CODIFIED (skill package)   │
                    │  skill status block     │             │    │ scripts + lockfile      │
                    │  injected from live     │             │    ├── success → ready       │
                    │  index (not memory)     │             │    └── prep fails → UNAVAILABLE
                    └──────┬──────────────────┘             └─────────────────────────────┘
               │                       │
               ▼                       ▼
        ┌─────────────┐         ┌─────────────┐
        │  applySkill  │         │   router    │
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
               │      │ tagFilter-   │   │  QUEUED      │    │  QUEUED                      │
               │      │ createLeaf   │   │  task popped │    │    │ in taskQueue[]          │
               │      │ Agent(tools, │   │     │        │    │    ▼ decomposeNode pops      │
               │      │  scratchpad) │   │  too complex?│    │  STAGED                     │
               └──────►     │        │   │     │yes     │    │    │                        │
                      │     │        │   │     ▼        │    │    ├── step ref skill:/xxx  │
                      │     │        │   │  split 2-3   │    │    │   → load sub-skill     │
                      │     │        │   │  child tasks │    │    │   → push steps to queue│
                      │     │        │   │  QUEUED ◄────┼─┐  │    │   → fail propagates up │
                      │     │        │   │     │        │ │  │    │                        │
                      │     │        │   │  simple?     │ │  │    ├── step ref ./script.js │
                      │     │        │   │     │        │ │  │    │   → validate inputs    │
                      │     │        │   │     ▼        │ │  │    │   → network restricted │
                      │     │        │   │  STAGED      │ │  │    │   → inject config+env  │
                      │     │        │   │  EXECUTING ──┼─┘  │    │   → execute in sandbox │
                      │     │        │   │  COMPLETE    │    │    │   → interpret output   │
                      │     │        │   └──────┬───────┘    │    │   → zero LLM tokens    │
                      │     │        │          │            │    │                        │
                      └─────┼────────┘          │            │    └── natural language     │
                            │                   │            │       → leaf agent (LLM)   │
                            └────────┬──────────┘            │           │                 │
                                     │                       │    EXECUTING               │
                                     ▼                       │    COMPLETE                 │
                          ┌─────────────────────┐            │       │ result → results[] │
                          │      aggregate       │            │    AGGREGATED              │
                          │                     │            │                            │
                          │  results[] merged   │            │  ⚠ ERROR PATH              │
                          │  → finalAnswer      │            │    sub-skill fail →        │
                          └──────────┬──────────┘            │    parent halts →          │
                                     │                       │    error propagates up     │
                                     ▼                       │    (retry/report deferred) │
                          ┌─────────────────────┐            └──────────────────────────────┘
                          │   authorMemories     │             ┌──────────────────────────────┐
                          │                     │             │  MEMORY ENTRY LIFECYCLE      │
                          │                     │             │                              │
                          │  write episodic      │             │  NEW  (authored here)        │
                          │  memories at         │             │    │ importance = initial    │
                          │  session end         │             │    ▼ retrieved               │
                          │                     │             │  ACTIVE                     │
                          │  shared experience →│             │    │ importance += 0.1       │
                          │  episodic memory    │             │    │ accessCount++           │
                          └──────────┬──────────┘             │    ▼ not retrieved           │
                                     │                        │  DECAYING                   │
                                    END                       │    │ importance *= 0.8       │
                                                              │    ▼ below threshold         │
                                                              │  PRUNED                     │
                                                              └──────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  STORAGE LAYER

  ┌─────────────────────────────┐       ┌──────────────────────────────────────────────────┐
  │     Long-Term Memory        │       │  Scratchpad                                      │
  │  namespace: [memory,userId] │       │  namespace: [scratchpad, threadId]               │
  │                             │       │                                                  │
  │  episodic  (general)────────┼──┐    │  ┌────────────────────────────────────────────┐  │
  │  semantic  ─── retrieve ◄───┼──┤    │  │  SCRATCHPAD ENTRY LIFECYCLE                │  │
  │  procedural ── inject ─────►┼──┘    │  │                                            │  │
  │                             │       │  │  tool/script/skill call completes          │  │
  │  ◄── author (post-response) │       │  │       │                                    │  │
  │  ◄── promote (from scratch) │       │  │    yes → PASS THROUGH                      │  │
  │                             │       │  │    no  ▼                                   │  │
  │  all types injectable       │       │  │       WRITTEN                              │  │
  │                             │       │  │         │ full content → cold store        │  │
  │  [decay job — periodic]     │       │  │         │ summary + ref → hot index        │  │
  │    importance *= 0.8        │       │  │         ▼  (summary shaped by output.schema)  │
  │    below threshold → PRUNED │       │  │       RETRIEVABLE                          │  │
  └─────────────────────────────┘       │  │    (skill steps + LLM call scratchpad_read) │  │
                                        │  │         │                                  │  │
  ┌──────────────────────────────┐      │  │  session ends                              │  │
  │     Checkpoint Store         │      │  │         ▼                                  │  │
  │  namespace: [thread,threadId]│      │  │     PRE-FLUSH                              │  │
  │                              │      │  │    index → memory author                   │  │
  │  conversation history        │      │  │         ▼                                  │  │
  │  graph state snapshots       │      │  │  promote to LTM? ── yes ───────────────────┼──┼──► Long-Term Memory
  │  hot memory between nodes    │      │  │         │ no                              │  │
  │  persists: across turns      │      │  │         ▼                                  │  │
  │  preserves: HITL pause state │      │  │      FLUSHED                               │  │
  └──────────────────────────────┘      │  └────────────────────────────────────────────┘  │
                                        └──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │  Skill Package Store  (filesystem)                                                   │
  │                                                                                      │
  │  skills/                                                                             │
  │    email-inbox/               ← codified, JavaScript, node 20                       │
  │      SKILL.md                 ← runtime, config, secrets, output declared           │
  │      getEmails.js             ← validates inputs, reads config/secrets from env     │
  │      getEmails.test.js                                                               │
  │      package.json                                                                    │
  │      package-lock.json        ← lockfile ✅ required                                │
  │      node_modules/            ← per-skill isolated env (.gitignore)                 │
  │    email-label-ads/           ← inference-only, runtime: none                       │
  │      SKILL.md                                                                        │
  │    email-workflow/            ← compositional, runtime: none                        │
  │      SKILL.md                                                                        │
  │                                                                                      │
  │  Skill Index (in-memory, rebuilt on startup)                                        │
  │    per skill: id, name, keywords, description, type,                                │
  │               status (ready | unavailable),                                         │
  │               preparedAt, lastError,                                                │
  │               missingConfig[], missingSecrets[]                                     │
  │    ← authoritative source of truth for skill health                                 │
  │    ← never duplicated into the memory system                                        │
  │                                                                                      │
  │  Platform Configuration Store  (operator-managed)                                   │
  │    config values  — non-sensitive, deployment-scoped                                 │
  │    secret values  — sensitive, injected as env vars at script execution             │
  │    ← resolved by platform at prep time and execution time                           │
  │    ← skills declare needs; platform satisfies them                                  │
  └──────────────────────────────────────────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════════════════════════════════════════

  MIDDLEWARE  (applied to every model call on every agent, on every branch)

  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                        │
  │  localLlmPromptMiddleware → memoryInjectionMiddleware → skillStatusMiddleware          │
  │    → scratchpadContextMiddleware → contextBudgetMiddleware → toolCompatibilityMiddleware│
  │                                                                                        │
  │  contextBudgetMiddleware — trims history oldest-first, then hard-caps total length     │
  │                                                                                        │
  │  memoryInjectionMiddleware  — injects memories into context                        │
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
                      │ rescued by retrieval
```

| State | Description | Entry Trigger |
|---|---|---|
| `NEW` | Created with initial importance and type assigned | `authorMemories` node |
| `ACTIVE` | Being retrieved and reinforced | Retrieved during hydration |
| `DECAYING` | Not retrieved within decay window | Periodic decay job |
| `PRUNED` | Deleted | Importance below threshold |

---

### Skill Lifecycle

```
LEARNED  (soft SKILL.md — inference-only, no scripts)
      |
      | developer formalises (human workflow)
      |
CODIFIED  ---- prep fails -------------------> UNAVAILABLE
  (SKILL.md + scripts + lockfile + tests)          |
             (missing runtime, lockfile,            |
              config, or secrets)                   |
                  ^                                 |
                  +----------- re-prep ------------+
```

| State | Description | Lockfile |
|---|---|---|
| `LEARNED` | Procedural memory pattern above promotion threshold — inference-only, no scripts | ❌ None |
| `CODIFIED` | Full skill package in `skills/` — locally authored or copied in | ✅ Required |
| `UNAVAILABLE` | Prep failed — not matchable | N/A |

**`UNAVAILABLE`** is triggered by any prep failure: runtime version mismatch, missing lockfile, unresolvable required config, unresolvable required secret, or invalid output contract declaration. Re-prep succeeds → status returns to `CODIFIED`.

**Promotion thresholds (`LEARNED` → `CODIFIED`) are starting assumptions without empirical basis.** The current values (`importance >= 0.9`, `accessCount >= 5`) should be calibrated against real usage before automation is considered. Collect the following data before tuning them:

| Data point | Description | Why it matters |
|---|---|---|
| `procedural.memory.importance` at time of manual codification | Importance score when a developer decided to formalise a pattern | Sets the upper bound — what score reliably identifies a promotable pattern |
| `procedural.memory.access_count` at time of codification | Access count at the same decision point | Calibrates the use-count threshold to actual developer behaviour |
| `procedural.memory.success_rate` | Fraction of retrievals that led to a successful task outcome | Filters noisy patterns — a high-importance, low-success pattern is not a good candidate |
| `procedural.memory.task_diversity` | Number of distinct task types that triggered this pattern | Patterns that generalise across diverse tasks are stronger candidates than narrow ones |

Until these data points are collected from real usage, the thresholds should not trigger automatic promotion. Promotion is a human decision.

---

### Task Lifecycle

```
QUEUED  →  STAGED  →  EXECUTING  →  COMPLETE  →  AGGREGATED
                │
                ├── step: skill:/xxx  →  RESOLVING  →  child tasks QUEUED
                │                         sub-skill fail → parent halts → ERROR PATH
                ├── step: ./script    →  SCRIPTING  →  COMPLETE (zero LLM tokens)
                │                         input invalid → explicit exit code → ERROR PATH
                └── step: natural lang →  LLM EXECUTING  →  COMPLETE

QUEUED  →  SPLIT  (parent discarded, 2-3 children re-enter QUEUED)

⚠ ERROR PATH  (retry / fail / report — policy deferred)
  sub-skill failure propagates to parent skill
  parent recorded as failed in Skill Index
```

| State | Description | Entry Trigger |
|---|---|---|
| `QUEUED` | In `taskQueue[]` | `applySkill`, `decomposeNode`, sub-skill resolution |
| `STAGED` | Popped to `currentTask` | Task simple enough to execute |
| `RESOLVING` | Sub-skill steps pushed to queue | Step contains `skill:` reference |
| `SCRIPTING` | Inputs validated, network-restricted sandbox, config + secrets injected, script executed, output interpreted | Step contains script reference |
| `LLM EXECUTING` | Leaf agent invoked | Step requires model reasoning |
| `COMPLETE` | Result in `results[]` — inline if small, scratchpad ref + summary if large | Any execution path returns |
| `AGGREGATED` | All siblings complete | `taskQueue` empty |

---

### Scratchpad Entry Lifecycle

```
(output <= threshold)  →  PASS THROUGH

(output > threshold)   →  WRITTEN  →  RETRIEVABLE  →  PRE-FLUSH  →  FLUSHED
                                                            │
                                               promote to LTM? → yes → Long-Term Memory
```

Summary quality is shaped by `output.schema` — the `summariserAgent` uses the declared schema to produce a summary appropriate to the data type. Skill steps (script and LLM) may read from and write to the scratchpad during execution.

---

## Memory Architecture

### Hot Memory

```
┌──────────────────────────────────────────────────────────┐
│                       HOT MEMORY                         │
│                                                          │
│  Conversation history     — managed by checkpointer      │
│  Session-hydrated facts   — loaded once at thread start  │
│  Request-hydrated facts   — injected at relevance threshold      │
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
│    episodic   — shared experiences, session narratives   │
│    semantic   — stable user facts, preferences           │
│    procedural — patterns that worked                     │
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
| Memory injection middleware | Middleware | Every model call |
| Skill status middleware | Middleware | Every model call — live from index |
| `scratchpad_read` | LLM or skill step — on demand | During reasoning or skill execution |

### Memory Injection

All memories written to long-term storage are available for injection in future sessions. Memories carry a `type` field (`episodic`, `semantic`, `procedural`) used to shape the hydration query — not to restrict visibility. The platform hydrates semantic and procedural patterns at session start; episodic memories are retrieved per-request based on keyword × importance scoring.

All memories are injectable. There is no `scope` field gating injection.

**The critical rule:** System state is never written to the memory system. Skill availability, runtime health, config resolution status, and prep outcomes live exclusively in the Skill Index and are injected live by `skillStatusMiddleware`.

**Memory vs. system state:**

```
System state (index only, never memory):
  "email-inbox is unavailable — GMAIL_CLIENT_ID not configured"
  ← binary, authoritative, current, changes when resolved

Episodic memory (written at session end):
  "During the email session on 2026-05-06, the inbox skill was
   unavailable. The task was completed using an alternative approach."
  ← narrative, past tense, no current-state claim
```

**Open design question — skill/tool availability vs. historical failure:**

The boundary between system state and episodic memory creates an important distinction:

| Signal | Type | Source | Example |
|---|---|---|---|
| Skill is currently unavailable | System state | Skill Index | `email-inbox: unavailable — missing GMAIL_CLIENT_ID` |
| Skill failed during a past task | Episodic memory | `memoryAuthoringAgent` | `email-inbox failed to fetch inbox on 2026-05-06 — rate limit exceeded` |

The first is authoritative and injected live; the model can act on it immediately (e.g. decline to use the skill, suggest configuration steps). The second is historical context; the model can use it to set expectations or suggest precautions, but must not treat it as current state.

The risk is that the model conflates the two: a historical failure episodic memory might be read as evidence the skill is currently broken. To mitigate this, `memoryAuthoringAgent` should write failure memories in strictly past-tense narrative form with an explicit date, and the `skillStatusMiddleware` live block always supersedes any memory that appears to contradict it. If conflation is observed at runtime, explicit memory scoping (`scope=historical`) can be introduced to prevent historical failure memories from being injected alongside the skill status block.

### Long-Term Memory Tiers

| Tier | Contains | Retention |
|---|---|---|
| **Episodic** | Shared experiences, session narratives, notable failures | Medium — decays |
| **Semantic** | Stable user facts, preferences | Long — reinforced |
| **Procedural** | Patterns that worked | Long — rarely pruned |

---

## Context Hydration

### Session Hydration

Runs **once per thread**. Loads stable user context for the thread lifetime.

**Loads:** Semantic preferences, communication style, recent session summary, top procedural patterns.
**Does not load:** Specific past facts (per request), skills (skill matcher), skill status (live index).

### Request Hydration

Runs **before every request**, augmenting the session layer.

**Process:** Query cold store → score by keyword × importance → apply relevance threshold → inject memories.

The LLM filter step is not used. A relevance threshold cut on the keyword × importance score is sufficient when the memory store is small.

**Measurement — tracking when keyword scoring becomes insufficient:**

| Metric | Description | Collection point |
|---|---|---|
| `memory.hydration.injected_count` | Number of memories injected per request | After threshold cut |
| `memory.hydration.context_utilisation` | Fraction of injected memories referenced in the final response | `memoryAuthoringAgent` observation |
| `memory.hydration.user_correction_rate` | Times a user corrects or contradicts an injected memory assumption | Post-response feedback |

When `context_utilisation` is consistently low (injected memories are unused) or `user_correction_rate` rises (injected memories are wrong), this signals keyword scoring is producing poor candidates and an LLM filter pass should be reconsidered.

**Comparison metric (if LLM filter is reintroduced):** Run parallel shadow evaluation — score the same candidates through the threshold cut and through an LLM filter. Compare `injected_count` and `context_utilisation` across both paths on the same requests. A filter that reduces `injected_count` while improving `context_utilisation` is removing true noise.

---

## Scratchpad

Session-scoped buffer preventing large outputs from polluting the context window.

### Role in the Hot/Cold Model

| Part | Layer | Content |
|---|---|---|
| **Index** | Hot — always injected | ref + summary (shaped by `output.schema`) |
| **Full content** | Cold — on demand | Raw output, chunked ~800 chars |

Skill steps — both script and LLM — may read from and write to the scratchpad during execution. This allows earlier steps in a skill to pass large intermediate results to later steps without those results entering the context window directly.

### Storage and Schema

```
ScratchpadRecord {
  ref, toolName, taskId, summary,
  chunks: [{ index, content }],
  createdAt, sessionId
}
```

Graph state holds only `{ sessionId: string }` — never a class instance.

### On-Demand Retrieval

`scratchpad_read(ref, query)` returns the first N chunks up to a character budget. Available to both LLM steps and skill scripts via the platform's environment interface.

Sequential chunk access (return chunks in order, stop at the character budget) is used rather than keyword-scored selection.

**`scratchpad_read` is a context rot mitigation, not just a retrieval convenience.** By keeping full content cold and surfacing only a budget-bounded slice on demand, it prevents large intermediate results from accumulating in the model's context window. This applies equally to skill steps reading prior outputs, leaf agents reading task results, and the `aggregateAgent` synthesising final answers — none of them receive the full content unless they explicitly ask for it.

**Measurement — tracking chunk quality for future improvement:**

| Metric | Description | Collection point |
|---|---|---|
| `scratchpad.read.chunks_returned` | Number of chunks returned per `scratchpad_read` call | Scratchpad read path |
| `scratchpad.read.consumer_referenced_fraction` | Fraction of returned chunks referenced in the consumer’s subsequent output | `memoryAuthoringAgent` / response analysis |
| `scratchpad.read.consumer_retry_count` | Times a consumer called `scratchpad_read` on the same ref more than once | Scratchpad read path |

When `consumer_referenced_fraction` is low (returned chunks are unused) or `consumer_retry_count` is high (sequential access is not surfacing the right chunks), this signals that keyword-scored selection should be added.

### Scratchpad Budget Policy

The scratchpad index lives in hot memory. Without a cap, long or complex sessions accumulate enough index entries to crowd out other hot memory — defeating the purpose of the scratchpad.

**Index cap:** A hard maximum of 10 live index entries per session. When the cap is reached, the oldest entries by `createdAt` are evicted — their index slot (ref + summary) is removed from hot memory and the full content is also discarded. Consumers that hold a ref to an evicted entry will receive a `MISS` from `scratchpad_read`.

**Cache-miss metric:** Track `scratchpad.index.eviction_miss_count` — the number of times `scratchpad_read` is called with a ref that no longer exists in the index (due to eviction). A rising miss rate indicates that sessions are working across more entries than the hard cap allows, and a demotion system (retain cold content, evict only the hot index slot) should be considered.

**Task results routing:** When a task completes, its result is written to the scratchpad if its output exceeds the interception threshold (same rule as tool output interception). `results[]` in graph state holds a `TaskResult` for each completed task. For large results, `TaskResult` carries a scratchpad ref + summary rather than inline content. The `aggregateAgent` receives the `results[]` array and uses `scratchpad_read` to pull the chunks it needs from any ref-backed entry — it never receives all large results inline.

**`scratchpad_read` as the retrieval path:** All consumers — `aggregateAgent`, leaf agents, skill LLM steps — access large results exclusively through `scratchpad_read`. There is no mechanism to bulk-load all scratchpad content into a context window. This is intentional: the retrieval path is the budget policy.

---

## Skills System

Skills are **named, portable, self-contained packages** encoding reusable approaches to recognised task types. Scripts are JavaScript only.

### Skill Package Structure

```
skills/
│
├── email-inbox/                          ← codified (JavaScript, node 20)
│   ├── SKILL.md                          ← runtime, config, secrets, output declared
│   ├── getEmails.js                      ← validates inputs, reads values from process.env
│   ├── getEmails.test.js
│   ├── package.json
│   └── package-lock.json                 ← lockfile ✅ required
│
├── email-label-ads/                      ← inference-only (runtime: none)
│   └── SKILL.md
│
└── email-workflow/                       ← compositional (runtime: none)
    └── SKILL.md
```

`node_modules/` is a build artefact — generated by prep, excluded from version control.

### The SKILL.md Format

**YAML frontmatter** — machine-readable metadata for the Skill Loader, matcher, and prep system.

```yaml
---
name: Email Inbox Fetch
version: 1.0.0
description: Fetch emails from a user's inbox
keywords: [email, fetch, inbox, retrieve, gmail]
type: atomic
runtime:
  language: javascript    # javascript | none
  version: "20"           # major.minor — patch managed by lockfile
config:
  - name: GMAIL_MAX_RESULTS
    type: number
    description: Maximum emails to fetch per request
    required: false
    default: 100
secrets:
  - name: GMAIL_CLIENT_ID
    type: string
    description: Client ID from Google Cloud Platform OAuth credentials
    required: true
  - name: GMAIL_CLIENT_SECRET
    type: string
    description: Client secret from Google Cloud Platform OAuth credentials
    required: true
  - name: GMAIL_REFRESH_TOKEN
    type: string
    description: OAuth refresh token for the Gmail service account
    required: true
inputs:
  user:   { type: string, required: true }
  count:  { type: number, default: 100 }
---
```

**Step-level output contract** — declared per script step in the markdown body:

```yaml
1. script: ./getEmails.js --user {user} --count {count}
   output:
     codes:
       0:   Success
       1:   Missing credentials — check GMAIL_CLIENT_ID and GMAIL_REFRESH_TOKEN
       2:   Rate limit exceeded — retry after 60 seconds
       3:   Invalid input — user parameter missing or empty
       404: No emails found in inbox
     schema:
       type: array
       items:
         id:         string
         subject:    string
         from:       email
         receivedAt: string
         unread:     boolean
         body:       string
```

**Config and secret naming:** `UPPER_SNAKE_CASE` — names map directly to environment variable names with no translation layer.

**Step reference syntax:**

| Syntax | Execution path |
|---|---|
| `./script.js --arg {value}` | Direct execution — zero LLM tokens |
| `skill:/skill-name` | Sub-skill resolution — steps pushed to task queue |
| Natural language | Leaf agent (LLM) — decides what to do with prior step output |
| `{placeholder}` | Resolved from context before execution |

### Output Contract

Every script step declares an `output` block. This is operational metadata for the platform — never injected into the model's context directly.

#### Exit Codes

The platform owns the top-level contract:
```
exit 0    → success — stdout contains the result
exit != 0 → failure — stderr contains the reason
```

Skill authors document all expected codes in `output.codes`, including input validation failures. The platform uses this map to translate a non-zero exit into a human-readable `lastFailure.reason` without interpreting stderr.

Input validation failures must use explicit exit codes documented in `output.codes`. A script that receives invalid or missing inputs must exit non-zero with a descriptive code rather than attempting to execute with bad data.

On failure: stdout is ignored, stderr captured for diagnostics, exit code looked up in the codes map and recorded in `lastFailure.mappedReason`.

#### Output Schema

Describes the shape of stdout on `exit 0`. Uses the type vocabulary consistent with `config` and `secrets`, extended for nested structures:

```yaml
output:
  schema:
    type: array           # array | object | string | number | boolean
    items:                # when type = array
      id:         string
      subject:    string
      from:       email
      receivedAt: string
      unread:     boolean
      body:       string
```

For plain text output: `schema: { type: string }`.

**The schema has two consumers — the LLM is not one of them:**

| Consumer | What they use | Why |
|---|---|---|
| `summariserAgent` | `type` + `items` shape | Produces a summary appropriate to the data type |
| Skill Index / `lastFailure` | `codes` map | Translates exit codes to human-readable reasons |

Inter-step data flow is the responsibility of the compositional skill's prescribed steps, not the output contract. The SKILL.md steps guide the LLM in reasoning over prior step output — that is inference work, not a platform concern. Large intermediate results are passed between steps via the scratchpad.

### Atomic Skills

Does one thing. May mix script steps and LLM steps. Every script step declares an `output` block including explicit codes for input validation failures. Steps may read from and write to the scratchpad.

### Compositional Skills

Orchestrates other skills via `skill:` references. No scripts, no runtime, no lockfile, no config, secrets, system dependencies, or output declarations of its own. All of these are declared and satisfied at the atomic skill level.

**Failure propagation:** if any sub-skill fails, the compositional skill halts immediately. The failure propagates up and is recorded against the compositional skill in the Skill Index — the same as an atomic skill execution failure. Partial results from completed sub-skills are not used.

**The RLM system and the skill system are the same system.** Depth-limited REPL execution prevents infinite nesting.

### Static and Learned Skills

| Type | Scripts | Lockfile | Config/Secrets | Output Contract | Input Validation | Reliability |
|---|---|---|---|---|---|---|
| **Learned** | ❌ None | ❌ None | ❌ None | ❌ None | ❌ None | Inference-only |
| **Codified (JS)** | ✅ Tested | ✅ Committed | Declared | ✅ Per step | ✅ Explicit exit codes | High |

### Skill Matching

```
Stage 1: Keyword pre-filter
  → reads frontmatter index only
  → excludes status != "ready"
  → returns candidate list
  → no candidates → router immediately

Stage 2: Deterministic ranking + LLM confirmation
  → rank candidates by:
      1. Specificity: fewer keywords = more specific = preferred
      2. Recency:     most recently matched wins
  → LLM confirms top-ranked candidate only
  → confidence >= 0.7 required
  → LLM not presented with full candidate list

match  →  applySkill (full SKILL.md loaded, steps typed and queued)
no match  →  router
```

**The ranking is deterministic.** The LLM's role in Stage 2 is confirmation, not selection. Consistent routing to higher-reliability skills is a platform responsibility, not an inference decision.

### Skill Execution

**Script — JavaScript (zero LLM tokens)**
```
resolve {placeholders} from context
  │
  ▼
activate per-skill isolated environment (node_modules/)
  │
  ▼
inject config + secrets as environment variables
  │
  ▼
execute in network-restricted sandbox
  script validates own inputs → exit non-zero with documented code if invalid
  stdout → result (interpreted using output.schema)
  stderr → diagnostics (never passed to LLM)
  script may call scratchpad_read / scratchpad_write during execution
  │
  ▼
exit 0:   parse stdout per output.schema
          output → scratchpad if large, else direct
exit != 0: look up code in output.codes
           record in lastFailure.mappedReason
           task → ERROR PATH
```

**Sub-skill (within compositional skill)**
```
load SKILL.md → push steps to queue (depth+1)
  → config/secrets/sysdeps resolved at each atomic skill's execution
  → sub-skill fails → parent halts immediately
  → failure recorded against parent in Skill Index
  → partial results discarded
```

**LLM**
```
createLeafAgent(selectedTools, scratchpad)
  → receives prescribed step instruction from SKILL.md
  → reasons over prior step output using step description as guide
  → may call scratchpad_read to access earlier step results
  → full middleware stack applied
```

### Skill Runtime Environment

All script-based skills execute in **Node.js** with a per-skill isolated `node_modules/` directory.

#### JavaScript — Node.js (Isolated)

Each JS skill runs against its own `node_modules/` resolved from the committed `package-lock.json`. The platform calls `npm ci` during prep. No two skills share packages.

**Lockfiles**

| Language | File | Tool |
|---|---|---|
| JavaScript | `package-lock.json` | `npm ci` |

#### Runtime Version

`runtime.version` specifies required major:

```yaml
runtime:
  language: javascript
  version: "20"         # >= 20.0.0 < 21.0.0
```

Mismatch is a hard fail at prep time with a clear remediation message.

#### Skill Prep

```
platform skill prepare <name>
  → checks runtime version         — hard fail on mismatch
  → verifies lockfile present      — hard fail if missing
  → resolves all required config   — hard fail if any missing
  → resolves all required secrets  — hard fail if any missing
  → validates output contract      — hard fail if malformed
  → npm ci --prefix skills/<name>/ — isolated node_modules
  → marks skill status = "ready"

platform skill prepare --all
  → preps all unprepared skills
  → skips runtime: none skills (no-op)
  → reports each failure with specific reason and remediation
```

### Skill Configuration and Secrets

Skills declare their configuration and secret needs in SKILL.md frontmatter. The platform satisfies those needs at prep and execution time. Skills never manage values directly.

#### The Contract

```
Skill declares (frontmatter):
  config:              non-sensitive deployment values
  secrets:             sensitive deployment values
  systemDependencies:  Bash only — system commands required

Platform provides (operator-managed):
  Configuration store  — non-sensitive values
  Secrets store        — sensitive values, never logged
  System environment   — Bash dependencies, verified at prep

Injection at execution time:
  config + secrets injected as environment variables
  scripts read via standard env APIs — no SDK required
  values never passed as CLI arguments or written to disk
```

#### Config vs. Secrets

| | Config | Secrets |
|---|---|---|
| **Sensitivity** | Non-sensitive | Sensitive — never logged |
| **Examples** | `GMAIL_MAX_RESULTS`, `API_BASE_URL` | `GMAIL_CLIENT_ID`, `GMAIL_REFRESH_TOKEN` |
| **Storage** | Platform config store | Platform secrets store |
| **Validation** | Type + presence at prep time | Presence at prep time (value never logged) |
| **Scope** | Per-deployment (operator-managed) | Per-deployment (operator-managed) |

#### Type Vocabulary

Used across `config`, `secrets`, and `output.schema`:

| Type | Validation |
|---|---|
| `string` | Presence only |
| `number` | Presence + parseable as number |
| `boolean` | Presence + `true` or `false` |
| `url` | Presence + valid URL format |
| `email` | Presence + valid email format |
| `array` | Output schema only — use with `items` |
| `object` | Output schema only — use with named fields |

### Skill Health

Skill health is tracked in the **Skill Index** — authoritative, never duplicated into memory.

```typescript
SkillIndexEntry {
  id:             string;
  name:           string;
  keywords:       string[];
  description:    string;
  type:           SkillType;      // atomic | compositional | inference-only
  status:         'ready' | 'unavailable';
  preparedAt:     Date | null;
  lastError:      string | null;
  missingConfig:  string[];
  missingSecrets: string[];
}
```

**State transitions:**

```
prep fails (any reason)  →  status = "unavailable", lastError recorded
re-prep succeeds         →  status = "ready", lastError cleared

execution fails          →  exit code looked up in output.codes
                            lastError updated

execution succeeds       →  lastError cleared
```

**Never written to memory:** availability status, config/secret failures, prep outcomes.

### Skill Authoring

Skills are written by developers. The platform does not automatically generate them.

```
1. IDENTIFY — observe a repeated task the agent handles manually

2. BUILD
   write scripts,
   validate inputs at script start — exit non-zero with
   documented code if required inputs missing or invalid,
   read all config/secrets from env,
   write unit tests (mock env vars, test invalid input paths),
   generate lockfile (npm)

3. COMPOSE  — write SKILL.md:
                runtime.language + runtime.version
                config + secrets entries
                output.codes including input validation codes
                output.schema per script step

4. VERIFY
   unit tests pass (success + all non-zero paths),
   integration test end-to-end,
   platform skill prepare succeeds
```

### Skill Maturity

All skills are `CODIFIED` — locally present packages that have passed prep. There is no tiered trust distinction between skills based on origin. A skill copied from an external source enters the same `CODIFIED` state as a locally authored one; it is the operator's responsibility to review it before running `platform skill prepare`.

| Tier | Description | Source | Trust |
|---|---|---|---|
| **LEARNED** | Procedural memory pattern above promotion threshold | Cold memory store | Operator-monitored — inference only |
| **CODIFIED** | Full skill package — SKILL.md, scripts, lockfile, tests | Local `skills/` | Operator-reviewed |

> **A skill gets more reliable as more of its mechanical steps become code. The LLM is reserved for what only a model can do.**

---

## Security Surface

### Script Sandbox Constraints

All JavaScript scripts execute in a **network-restricted sandbox**. This is the single non-negotiable constraint applied to every skill script execution.

**Network restriction is on by default.** Scripts cannot make outbound network calls unless the platform operator explicitly lifts the restriction for a specific deployment. Skills that require network access must make that access through platform tools, not directly from within the script.

**Filesystem access is governed by the process owner.** The platform does not impose additional filesystem restrictions beyond what the operating system enforces for the user running the process. The security posture therefore depends on the deployment environment:

```
Recommended:  Docker container
  → process runs as a non-root user inside the container
  → filesystem access limited to the container's mounted volumes
  → network restriction enforced at the container network layer
  → clear boundary between the platform and the host system

Supported:    Bare metal (e.g. macOS, Linux)
  → process runs as the user who launched the platform
  → filesystem access is that user's full access
  → operator accepts the risk of this configuration
  → suitable for personal, single-user deployments
```

> **The recommended deployment is Docker. Operators running on bare metal accept the filesystem access risk that comes with it.**

**What the network restriction protects against:**

A skill script that attempts to exfiltrate injected secrets or scraped filesystem content via an outbound HTTP call will be blocked at the network layer in a correctly deployed environment.

**What the network restriction does not protect against:**

- A malicious script writing sensitive data to a file the operator can access (filesystem risk — mitigated by Docker)
- A script that encodes secrets in its stdout output (see [Deferred Security Concerns](#deferred-security-concerns))
- A script that consumes excessive CPU or memory (resource limits are configurable per skill but not enforced by default)

### Supply Chain

The platform relies on npm's built-in integrity verification:

- **npm** verifies package integrity against `package-lock.json` hashes at install time

This is the supply chain guarantee: two installs from the same lockfile on the same platform will produce byte-identical environments, and any tampered package will fail hash verification before it is installed.

**The platform does not perform additional package verification beyond what the package manager provides.** Additional supply chain hardening is a deployment-level concern for operators with elevated security requirements.

### Deferred Security Concerns

| Concern | Deferred rationale | Preferred approach when addressed |
|---|---|---|
| **Input sanitisation** (placeholder injection) | Low immediate risk for trusted skill authors | Escape all `{placeholder}` values before interpolation; use argument arrays for JS subprocesses |
| **Secret exfiltration via stdout** | Requires a redaction pass on all script output | Exact-match scan of stdout against known secret values before scratchpad write; replace matches with `[REDACTED]` |
| **Resource limits** (CPU, memory, time) | Highly deployment-dependent | Timeout and memory cap configurable per skill; enforced at sandbox level |

---

## Recursive Language Models (RLM)

> **Source**: Zhang & Khattab, MIT CSAIL — *Recursive Language Models* (Oct. 2025). [arxiv.org/abs/2512.24601](https://arxiv.org/abs/2512.24601v1)

### What RLMs Are

An RLM is a **thin wrapper around a language model** that can query large contexts via a REPL environment rather than receiving the full context in a single prompt. From the caller's perspective it is identical to a standard model call — `rlm.completion(messages)` is a drop-in replacement for `lm.completion(messages)`.

The key insight is a **context-centric view** of decomposition. The context is an object to be understood — the model queries it selectively using REPL primitives rather than seeing it all at once.

The platform implements single-depth context querying. The root LM interacts with context via REPL primitives; it does not spawn recursive sub-calls.

### The Problem: Context Rot

"Context rot" is the empirically observed degradation in model reasoning quality as the context window fills. A model that performs well on short contexts makes progressively more errors on long ones — not because of token limits, but because longer sequences fall outside training distributions and incur higher-entropy attention patterns.

Context rot manifests at three distinct scopes, each requiring a different mitigation:

| Scope | Description | Primary mitigation |
|---|---|---|
| **Cross-session** | Memories and conversation history accumulate across multiple threads over time | Memory decay, hot/cold boundary, session hydration policy |
| **Cross-request** | A single long thread accumulates context across many turns | Request hydration (relevance threshold), middleware token budget |
| **Intra-request** | A single request accumulates intermediate results — task outputs, tool results, `results[]` entries — before `aggregateAgent` synthesises them | Scratchpad interception, `results[]` ref routing (see [Scratchpad Budget Policy](#scratchpad-budget-policy)) |

RLMs address context rot without solving it at the architecture level. No single model call ever sees the entire context. The root LM sees only the query; the context lives in an environment the root LM can query selectively.

### Mechanism: REPL Environment

A **REPL** (Read-Eval-Print Loop) is an interactive code execution environment — the model writes a snippet of code, the platform runs it and returns the result, and the model writes the next snippet based on what it saw. Think of it as a Python notebook: each cell executes immediately and its output is available to subsequent cells.

The platform provides the root LM with such an environment in which the full context is pre-loaded as a single string variable. The context is always a flat string — one large document, a file, or concatenated text — never a structured object or collection. Rather than receiving the entire context in its prompt, the root LM writes code cells to query it selectively:

```
User query
    │
    ▼
Root LM (depth=0)
  sees: query only + context metadata (size, mime_type)
  interacts via: REPL cells (peek, grep, slice, call sub-LM)
    │
    ├── REPL cell: peek at first N chars to observe structure
    ├── REPL cell: grep/regex to narrow lines of interest
    └── REPL cell: FINAL(answer) or FINAL_VAR(variable_name)
```

When the root LM is confident in its answer it emits `FINAL(answer)` (inline) or `FINAL_VAR(var)` (from a REPL variable holding a built-up result).

### REPL Primitive API

The platform exposes a fixed set of primitives the root LM may call within REPL cells. These are an architectural commitment — the platform guarantees their availability; the root LM is free to compose them as it sees fit.

| Primitive | Signature | Description |
|---|---|---|
| `peek` | `peek(context, n)` | Read the first `n` characters of a context object without loading the remainder |
| `grep` | `grep(context, pattern)` | Return all lines matching a string or regex pattern |
| `slice` | `slice(context, start, end)` | Extract a byte-range or line-range window from the context |
| `scratchpad_read` | `scratchpad_read(ref, query)` | Retrieve top chunks from a scratchpad entry by keyword relevance |
| `scratchpad_write` | `scratchpad_write(label, value)` | Write a value to the scratchpad; returns a ref for later retrieval |
| `FINAL` | `FINAL(answer)` | Emit the final answer inline and terminate the REPL session |
| `FINAL_VAR` | `FINAL_VAR(variable_name)` | Emit the final answer from a REPL variable and terminate the session |

The platform does not expose file system access, network calls, or platform internals through the REPL primitive API.

### REPL Execution Environment

The platform must provide an execution environment in which REPL cells run. The specific runtime is an implementation decision; the environment must satisfy the following properties:

- **Statefulness** — variables assigned in one cell are visible in all subsequent cells within the same session
- **Synchronous execution** — each cell completes fully before the next cell is written; the root LM always sees a complete result before proceeding
- **Output capture** — stdout and return values from each cell are captured and returned to the root LM as the cell's result
- **Isolation** — the REPL session is scoped to a single RLM request; it cannot read or write state from other sessions or other platform subsystems
- **Bounded resources** — the environment enforces a per-cell timeout and a per-session memory ceiling; runaway cells fail fast rather than stalling the request (see [REPL Limits and Cleanup](#repl-limits-and-cleanup))
- **Primitive availability** — all primitives defined in [REPL Primitive API](#repl-primitive-api) are pre-loaded and available without import
- **Error containment** — cell-level errors are caught and returned as the cell's result; the session is not terminated by a recoverable error (see [REPL Cell Errors](#repl-cell-errors))

### REPL ↔ Scratchpad, Tools, and Skills

The REPL environment does not operate in isolation — it is a first-class participant in the platform's shared infrastructure.

**Scratchpad**

The REPL can read from and write to the scratchpad using `scratchpad_read` and `scratchpad_write`. This serves two purposes:

1. **Passing results forward** — if an intermediate REPL computation produces a large result, the root LM writes it to the scratchpad rather than accumulating it in a REPL variable. Subsequent cells retrieve only the chunks they need.
2. **Receiving prior context** — skill steps executed before the RLM loop may have already written outputs to the scratchpad. The root LM can read those entries as part of its exploration strategy, treating prior skill output as part of the context it is reasoning over.

REPL cells that produce large outputs follow the same scratchpad interception threshold as tool and script outputs. The platform intercepts the write, stores the full content cold, and returns a ref + summary to the REPL cell as its result.

**Platform Tools**

The REPL does not have direct access to the platform tool registry. If a task requires tool use, that work happens in a standard leaf agent on the simple path — not inside the RLM loop.

**Skills**

Skills may activate before the RLM loop (via `matchSkill`) but not from within it. The REPL is the fallback path for requests where no skill matched. A REPL session cannot itself trigger a skill match — it reasons over context using primitives and recursive sub-calls only. Results produced by a prior skill step that ran before the RLM loop are accessible via the scratchpad.

### REPL Session Lifecycle

A REPL session is created per RLM request and destroyed when that request completes.

```
RLM request received
    │
    ▼
SESSION CREATED
  context object pre-loaded
  all primitives available
  cell counter = 0
    │
    ▼
CELL EXECUTION  (repeated)
  root LM writes cell
  platform executes cell → returns result
  cell counter++
  cell limit reached? → LIMIT EXCEEDED
    │
    ▼
SESSION TERMINATING
  root LM emits FINAL(answer) or FINAL_VAR(var)
    │
    ├── scratchpad_write calls already committed
    │
    ▼
SESSION DESTROYED
  all REPL variables discarded
  scratchpad entries written during the session are retained (session-scoped)
  context object reference released
```

| State | Description |
|---|---|
| `CREATED` | Environment initialised, context pre-loaded, primitives available |
| `CELL EXECUTION` | Root LM iteratively writes and executes cells; outputs returned after each |
| `LIMIT EXCEEDED` | Cell limit reached without `FINAL` — platform forces termination (see [REPL Limits and Cleanup](#repl-limits-and-cleanup)) |
| `TERMINATING` | `FINAL` or `FINAL_VAR` emitted; session winding down |
| `DESTROYED` | All REPL state discarded; scratchpad entries from the session retained |

REPL sessions are always single-request. There is no mechanism to resume a REPL session from a prior request, and no REPL state persists to the checkpoint store.

### REPL Limits and Cleanup

Without explicit limits, a root LM can explore indefinitely — accumulating cost, latency, and REPL variable state without converging on an answer.

**Recommended cell limit: 20 cells per session.**

This is sufficient for all documented interaction strategies (peeking, grepping, partition+map, summarisation) applied to contexts up to ~10M tokens. A well-functioning root LM converges well within this limit; a session approaching the limit signals either an unusually complex context or a runaway exploration pattern.

**When the cell limit is reached:**

```
cell counter >= cell_limit
    │
    ▼
Platform forces FINAL_VAR(<best_so_far>)
  if a REPL variable named best_so_far exists → use it as the answer
  otherwise → emit a partial answer with an explicit incompleteness note
    │
    ▼
SESSION DESTROYED (same as normal termination)
```

The platform does not retry the request automatically when the limit is reached — that policy is deferred.

**Cell-limit tracking:**

Track `repl.session.cell_limit_hit_rate` — the fraction of RLM sessions that reach the cell limit before emitting `FINAL`. A rising rate signals that either context sizes are growing beyond the 20-cell design assumption, or that the model is producing runaway exploration patterns. If OOM-before-limit is suspected, also track `repl.session.unrecoverable_error_rate` (sessions terminated by timeout or OOM before hitting the cell limit).

**Between-request cleanup:**

REPL sessions are destroyed on request completion — there is no between-request state to clean up. Scratchpad entries written during the session follow standard scratchpad lifetime (retained for the thread session, subject to the normal PRE-FLUSH → FLUSHED transition at session end).

### REPL Cell Errors

Cell-level errors fall into two categories:

**Recoverable errors** — returned as the cell's result; the session continues.

Examples: invalid regex pattern passed to `grep`, a `slice` with out-of-bounds indices.

The error message is returned to the root LM as the cell output. The root LM is expected to observe the error and adapt its next cell — retrying with a corrected pattern, choosing a different strategy, or moving toward a `FINAL` with a partial answer.

**Unrecoverable errors** — terminate the session immediately, equivalent to hitting the cell limit.

Examples: a cell that exceeds the per-cell timeout, a cell that causes the environment to run out of memory.

On an unrecoverable error, the platform forces `FINAL_VAR(best_so_far)` using the same procedure as the cell limit (see [REPL Limits and Cleanup](#repl-limits-and-cleanup)). The forced answer includes a note indicating the session was terminated by an environment error.

```
Recoverable error
  → error message returned as cell result
  → cell counter++
  → root LM resumes

Unrecoverable error (timeout, OOM)
  → platform forces FINAL_VAR(best_so_far)
  → SESSION DESTROYED
```

### Recursive Depth

The platform implements single-depth context querying. The root LM interacts with context via REPL primitives (`peek`, `grep`, `slice`, `scratchpad_read`, `scratchpad_write`). There are no recursive sub-calls (`call_lm`). Partition + map strategies that require sub-LM calls are not supported.

```
matchSkill → no match → router → "simple"  → single leaf agent
                               → "complex" → RLM (root LM + REPL)
```

### Emergent Interaction Strategies

The root LM autonomously selects how it interacts with the context. The following strategies emerge without being explicitly programmed:

| Strategy | Description |
|---|---|
| **Peeking** | Read the first N characters to observe structure before committing to a retrieval plan |
| **Grepping** | Use keyword or regex patterns to narrow the search space without semantic retrieval |
| **Summarisation** | Summarise subsets of context into the root LM's REPL environment for final synthesis |
| **Programmatic processing** | For deterministic tasks (diff tracking, BibTeX generation, counting), write REPL code that processes the context directly, bypassing LM inference entirely |

The choice of strategy is the root LM's decision at inference time — it is not prescribed by the platform.

### RLMs vs. Agents

| | Agents | RLMs |
|---|---|---|
| **Decomposition axis** | Problem / task | Context |
| **What the LM sees** | Full conversation + tool results | Query only; context via REPL |
| **Who decides decomposition** | Human-designed routing logic | The root LM at inference time |
| **Intermediate state** | Tool call history in context | REPL variables — never in context |
| **Context rot mitigation** | Summarisation / pruning (heuristic) | No single call sees the full context |

### Activation

RLMs activate as the fallback path when no skill matches and the router classifies the request as complex. Simple requests are handled by a single leaf agent; complex ones enter the RLM loop.

```
matchSkill
  match   → applySkill
  no match → router
               "simple"  → leaf agent
               "complex" → RLM root LM + REPL environment
```

**Router classification criteria.** The router classifies a request as complex when one or more of the following signals are present:

| Signal | Description |
|---|---|
| **Large context** | The context to be reasoned over exceeds a threshold that makes single-call reasoning unreliable |
| **Aggregation task** | The request requires scanning all of a large body of text (count, find all, summarise everything) |
| **Multi-pass structure** | Answering the question requires first understanding the structure of the context, then querying it — two or more logical passes |

The router is an LLM agent — these signals are inputs to its classification, not hard rules. A request exhibiting none of these signals is classified simple regardless of query complexity.

### Validation Gate

Before building the REPL infrastructure, a 2–4 hour experiment is required to validate that 8B parameter local models can use the primitives correctly.

**Experiment design:**

1. Give the model a 6-primitive REPL prompt and a ~20k-token document
2. Ask 5 representative questions (structural, grep-able, aggregation, summarisation, programmatic)
3. Assess: does the model call primitives with correct syntax? Does it use results to refine subsequent cells? Does it emit `FINAL` correctly?

**Pass criteria:**
- 4 of 5 questions answered correctly
- No hallucinated primitives or parameters
- `FINAL` emitted without prompting on all 5

**If the model fails:** the RLM loop is not built; complex requests fall back to the summariser agent with a token-budget guard. This is recorded as a deferred decision with a clear re-entry trigger (model capability improvement).

**If the model passes:** proceed with REPL infrastructure implementation.

### Performance Characteristics

Based on the published research (GPT-class models):

- **OOLONG (132k tokens)**: RLM(GPT-5-mini) outperforms GPT-5 by >33% raw score at roughly equal API cost
- **BrowseComp-Plus (1000 documents / ~10M tokens)**: RLM is the only approach to maintain performance at this scale
- **Scaling**: RLM performance degrades gracefully as context grows; base model performance collapses

### Limitations

- **Recursive sub-calls (`call_lm`) are not implemented.** Partition + map strategies are not available.
- **Cost and latency are not bounded**: REPL exploration over large contexts can be expensive; the platform does not currently cap total RLM cost per request
- Performance on counting and numerical aggregation tasks degrades at very large context sizes
- The interaction strategies that emerge are **not reproducible** — the same query over the same context may produce different REPL trajectories across runs

### How RLMs Fit into the Platform

RLMs address the hardest constraint the platform is built around: **small context windows on local hardware**. Every other mechanism — memory tiers, the scratchpad, middleware, skill decomposition — manages what goes into the context window. RLMs change the question. Rather than asking "how do we fit the context in?", they ask "how do we make the model useful without ever loading the full context at all?"

This is a direct expression of the platform's core design principles:

| Principle | How RLMs express it |
|---|---|
| **Local-first** | No single model call ever sees the full context — the root LM operates on a tiny prompt regardless of how large the source material is |
| **Intentional context** | The root LM decides what to read and when; nothing enters the context window by accident — every peek, grep, and slice is a deliberate act |
| **Separation of concerns** | The REPL environment handles context access; the root LM handles reasoning; the platform handles resource bounds and error containment — each layer does one thing |
| **Progressive complexity** | Simple requests never enter the RLM loop; complexity is added only when the router determines the context is too large for a single call |
| **Code over inference** | The REPL allows the root LM to express deterministic steps as code — counting, diffing, filtering — bypassing LLM inference entirely for work that doesn't need it |

The practical result: a small local model that would degrade badly on a 50k-token document can reason accurately over it by reading only the relevant slices. The model's effective capability scales with the context, not against it.

**Where RLMs sit in the execution path.** They are not the primary path — they are the last resort before the user sees a degraded answer. Skills handle known task types cheaply and reliably. The router handles simple unrecognized requests with a single leaf agent. RLMs activate only when neither of those options is sufficient: the request is novel, complex, and involves large context. This ordering is intentional — the cheapest capable path always wins.

---

## Tool System

### Platform Tools vs. Skill Scripts

| | Platform Tools | Skill Scripts |
|---|---|---|
| **Registration** | Central registry | Co-located with skill |
| **Scope** | Any agent | Owning skill only |
| **Selection** | Tag-based static filter | Resolved from SKILL.md |
| **Dependencies** | Platform-managed | Per-skill isolated env (JS) |
| **Config/secrets** | Platform-managed | Declared in SKILL.md, injected as env vars |
| **Output contract** | `outputMaxChars` threshold only | `output.codes` + `output.schema` per step |
| **Input validation** | Platform responsibility | Script responsibility — explicit exit codes |
| **Network access** | Unrestricted | Restricted by default |
| **Scratchpad access** | Via tool output interception | Read and write during execution |
| **Examples** | `web_search`, `read_file` | `getEmails.js` |

### Tool Registry

```typescript
RegisteredTool {
  tool, description, tags,
  requiresConfirmation: boolean,
  outputMaxChars:       number
}
```

### Tag-Based Tool Selection

Leaf agents are tagged with the tool categories they need. Platform tools carry matching tags. At task execution, the platform filters tools to only those whose tags intersect with the leaf agent's tags. No LLM is involved in tool selection.

### Tool Output Interception

```
output <= threshold  →  unchanged
output >  threshold  →  full content → scratchpad
                         summary + ref → message
```

For skill scripts, `summariserAgent` uses `output.schema` to shape the summary. For platform tools, output is treated as text.

### Human-in-the-Loop (HITL)

`requiresConfirmation: true` triggers an interrupt. Graph pauses, resumes on `approve` / `edit` / `reject`.

**Timeout:** HITL interrupts have a configurable timeout (default: 24 hours). When the timeout expires, the platform automatically takes the `reject` path and records the reason as `hitl_timeout`. A session that hits HITL and is never responded to does not block indefinitely.

---

## Middleware Layer

> **Middleware handles constraints. The graph handles coordination. Scripts handle deterministic work.**

Script execution bypasses middleware — it only applies to LLM calls.

### Middleware Stack

```
Before each model call:
  1. localLlmPromptMiddleware      — brevity/focus instruction
  2. memoryInjectionMiddleware     — injects memories into context
  3. skillStatusMiddleware         — live skill index status block
  4. scratchpadContextMiddleware   — scratchpad index
  5. contextBudgetMiddleware       — trim conversation history oldest-first, then hard-cap total message length
  6. toolCompatibilityMiddleware   — tool format reminder

After each model call:
  7. toolCompatibilityMiddleware   — recover malformed tool calls
```

**`contextBudgetMiddleware`** merges the former `focusedContextMiddleware` (history trimming) and `tokenBudgetMiddleware` (hard cap) into a single two-phase pass: trim the oldest conversation turns until the message fits the window budget, then hard-cap the total message length as a final guard. One policy, one implementation.

**`skillStatusMiddleware`** injects a live block from the Skill Index — never from memory:

```
[system — skill status]
Available:   email-inbox, email-label-ads, email-workflow
Unavailable: email-label-keyword (missing secret: GOOGLE_API_KEY)
```

---

## Agent Design

### Agent Roles

| Agent | Tools | When | Purpose |
|---|---|---|---|
| `routerAgent` | ❌ | Every request | Classify: simple or complex; decompose if complex |
| `leafAgent` *(factory)* | ✅ | Simple path or each sub-task | Execute one focused natural-language task |
| `aggregateAgent` | ❌ | After parallel sub-tasks | Synthesise results — receives `results[]` with inline content or scratchpad refs |
| `memoryAuthoringAgent` | ❌ | Session end | Extract memories, author shared experiences |
| `skillConfirmationAgent` | ❌ | After skill candidate shortlisting | Stage 2 — confirm top-ranked candidate |
| `summariserAgent` | ❌ | After large output | Summarise large outputs — uses `output.schema` for script outputs |

**Happy path**: `routerAgent` → `leafAgent` → done. Decomposition, aggregation, memory authoring, and summarisation are invoked only when needed.

**Script execution involves no agent.** Scripts run directly in a network-restricted sandboxed environment. The `summariserAgent` runs after execution if output exceeds the scratchpad threshold.

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
GraphState {
  goal, userRequest, userId,
  scratchpadRef:     { sessionId: string }
  branch:            "simple" | "complex" | null
  taskQueue:         Task[]
  currentTask:       Task | null
  results:           TaskResult[]   — inline content or { ref, summary } for large outputs
  finalAnswer:       string
  injectedMemories:  string | null
  availableTools:    RegisteredTool[]
  matchedSkill:      Skill | null
}

Task {
  id, description, parentId,
  stepRef?:       string        — "./script" | "skill:/name" | undefined
  resolvedArgs?:  Record<string, string>
  outputSchema?:  OutputSchema  — from step output.schema, passed to summariserAgent
  parentSkillId?: string        — set for sub-skill steps, enables failure propagation
  requiresLLM:    boolean
}
```

### Node Execution Order

```
START → sessionHydrate (new thread) → extractMemories → matchSkill
  │       (rank candidates, LLM confirms top only)
  │
  ├── matched → applySkill → resolveSteps → execute → aggregate → authorMemories → END
  │
  └── no match → router
                   ├── simple → tagFilterTools → simpleExecute → authorMemories → END
                   └── complex → decompose ◄──────────────────────────────────┐
                                     │                                         │
                                 currentTask? ── no ──────────────────────── ►│
                                     │ yes
                                     ▼
                                 resolveStep
                                   ├── script (JavaScript)
                                   │     activate env → inject config + secrets
                                   │     network-restricted sandbox execute
                                   │     (script validates own inputs)
                                   │     interpret output → COMPLETE
                                   │     exit != 0 → ERROR PATH
                                   ├── sub-skill → push steps → QUEUED
                                   │     sub-skill fails → halt parent → ERROR PATH
                                   │     record parentSkillId in lastFailure
                                   └── LLM → tagFilterTools → leafAgent → COMPLETE
                                                  (may read/write scratchpad)
                                                        │
                                                    aggregate → queue empty?
                                                        │ yes
                                                    authorMemories → END
```

### Session Persistence

Checkpointer provides: conversation history across turns, process restart resumability, HITL pause/resume, per-`thread_id` isolation.

---

## Deferred Decisions

### Structural Decisions

| Decision | Options / Notes |
|---|---|
| Cold memory storage backend | SQLite, Redis, PostgreSQL, vector DB, flat files |
| Hot memory token budget | Depends on model context window |
| Platform configuration store | `.env` file, HashiCorp Vault, AWS Secrets Manager, OS keychain |
| Config store access pattern | Loaded at startup, queried at prep, or queried at execution |
| Cold-to-hot promotion scoring | Keyword, semantic similarity, recency, importance |
| Session hydration policy | What to load; item count; recency window |
| Scratchpad eviction / TTL | Memory pressure vs. session length |
| Skill versioning and upgrades | Deferred to skill management system |
| Script sandbox runtime | Node.js subprocess, Deno, WASM |
| Script timeout and resource limits | Deployment dependent — configurable per skill |
| Multi-agent topology | Supervisor, peer-to-peer, shared state |
| Supply chain hardening | Package signing, provenance attestation — for elevated security deployments |
| Input sanitisation | Escape `{placeholder}` values before interpolation; argument arrays for JS subprocess |
| Secret exfiltration via stdout | Exact-match redaction pass on script stdout before scratchpad write |
| **RLM recursive sub-calls** | `call_lm` primitive — validate 8B model single-depth via [Validation Gate](#validation-gate) first |
| **Skill health metrics** | `consecutiveFailures`, `successRate` — deferred; not needed until skill library grows |
| **Memory scoping for historical failures** | `scope=historical` tag to prevent episodic skill-failure memories conflating with live skill status — deferred; add only if model conflation is observed at runtime |
| **Request hydration LLM filter** | Re-add LLM filter pass over keyword-scored candidates — deferred; re-evaluate when `memory.hydration.context_utilisation` or `user_correction_rate` degrades |
| **Scratchpad chunk keyword scoring** | Keyword-scored chunk selection in `scratchpad_read` — deferred; re-evaluate when `scratchpad.read.consumer_referenced_fraction` falls or `consumer_retry_count` rises |
| **Scratchpad index demotion** | Soft cap with cold demotion (retain cold content, evict only hot index slot) — deferred; re-evaluate when `scratchpad.index.eviction_miss_count` rises |
| **Learned skill promotion thresholds** | `importance >= 0.9`, `accessCount >= 5` starting assumptions — calibrate against `procedural.memory.importance`, `access_count`, `success_rate`, `task_diversity` at time of manual codification |

### Transition Policies

```
Memory:
  initial_importance:      episodic=0.5, semantic=0.6, procedural=0.7
  decay_window:            default 7 days
  decay_factor:            default 0.8 per cycle
  prune_threshold:         default 0.05
  rescue_on_retrieval:     true

Scratchpad:
  intercept_threshold:     default 300 chars
  index_cap:               10 entries (hard cap — oldest by createdAt evicted)
  ltm_promotion:           memory authoring agent per entry
  interrupted_session:     deferred

Tasks:
  retry_limit:             deferred — 1 suggested
  parallel_execution:      false (default) — deferred
  error_reporting:         deferred

Threads:
  session_timeout:         deferred — 30 minutes suggested
  rehydration_gap:         deferred — 1 hour suggested
  hitl_timeout:            configurable — default 24 hours; auto-reject on expiry
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
| Script network restriction | Docker network layer (recommended) | OS-level firewall rules |
| Skill discovery | Filesystem scan of `skills/` | Database, registry service |
| Skill index | In-memory (rebuilt on startup) | Persistent store |
| Platform config store | `.env` file (development) | Vault, Secrets Manager, OS keychain |
| Deployment (recommended) | Docker container | Kubernetes, bare metal (accepted risk) |

---

## Closing Principles

> **Everything shown to the model is intentional, minimal, and justified for the task at hand. Everything else is stored, indexed, and made accessible only when the model asks for it.**

> **Mechanical work is code. Reasoning work is inference. Skills are the boundary between the two.**

> **System state is never stored in memory. Shared experience always is. The agent recalls history honestly — it never confuses what happened with what is currently true.**

> **Skills trust the platform. Skills declare what they need; the platform satisfies it. A skill that does not bundle credentials is a skill that can be safely shared.**

> **Network access is a privilege, not a default. Scripts are isolated from the network unless the operator explicitly decides otherwise. Filesystem access is bounded by the deployment environment — Docker is the recommended boundary.**