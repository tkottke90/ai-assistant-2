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
    - [Output Contract](#output-contract)
      - [Exit Codes](#exit-codes)
      - [Output Schema](#output-schema)
    - [Atomic Skills](#atomic-skills)
    - [Compositional Skills](#compositional-skills)
    - [Static and Learned Skills](#static-and-learned-skills)
    - [Skill Matching](#skill-matching)
    - [Skill Execution](#skill-execution)
    - [Skill Runtime Environments](#skill-runtime-environments)
      - [Per-Skill Isolation (JavaScript and Python)](#per-skill-isolation-javascript-and-python)
      - [Bash — No Isolation](#bash--no-isolation)
      - [Runtime Version (JavaScript and Python)](#runtime-version-javascript-and-python)
      - [Lockfiles (JavaScript and Python)](#lockfiles-javascript-and-python)
      - [Skill Prep](#skill-prep)
      - [Bash as a Last Resort Runtime](#bash-as-a-last-resort-runtime)
    - [Skill Configuration and Secrets](#skill-configuration-and-secrets)
      - [The Contract](#the-contract)
      - [Config vs. Secrets](#config-vs-secrets)
      - [Type Vocabulary](#type-vocabulary)
    - [Skill Health](#skill-health)
    - [Skill Authoring](#skill-authoring)
      - [Track 1 — Emergent (Automatic)](#track-1--emergent-automatic)
      - [Track 2 — Deliberate (Human)](#track-2--deliberate-human)
    - [Skill Maturity Model](#skill-maturity-model)
  - [Security Surface](#security-surface)
    - [Script Sandbox Constraints](#script-sandbox-constraints)
    - [Supply Chain](#supply-chain)
    - [Deferred Security Concerns](#deferred-security-concerns)
  - [Recursive Language Models (RLM)](#recursive-language-models-rlm)
    - [What RLMs Are](#what-rlms-are)
    - [The Problem: Context Rot](#the-problem-context-rot)
    - [Mechanism: REPL Environment](#mechanism-repl-environment)
    - [Recursive Depth](#recursive-depth)
    - [Emergent Interaction Strategies](#emergent-interaction-strategies)
    - [RLMs vs. Agents](#rlms-vs-agents)
    - [Activation](#activation)
    - [Performance Characteristics](#performance-characteristics)
    - [Limitations](#limitations)
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
                    │    rank candidates      │             │  LEARNED (soft SKILL.md)    │
                    │    LLM confirms top     │             │    │ no scripts              │
                    │    confidence >= 0.7    │             │    ▼ (human dev workflow)   │
                    │                         │             │  CODIFIED (skill package)   │
                    │  skill status block     │             │    │ scripts + lockfile      │
                    │  injected from live     │             │    ▼ (review + stable)       │
                    │  index (not memory)     │             │  STATIC (community)         │
                    └──────┬──────────────────┘             │    │                         │
                           │                                │    ├── success → maintained  │
               ┌───────────┴───────────┐                   │    ├── prep fails → UNAVAILABLE
          matched                  no match                 │    ├── exec fails → DEGRADED  │
               │                       │                   │    └── rate < threshold →     │
               ▼                       ▼                   │        DEPRECATED            │
        ┌─────────────┐         ┌─────────────┐            └─────────────────────────────┘
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
               │      │ selectTools  │   │  QUEUED      │    │  QUEUED                      │
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
                          │  + maybeAuthorSkill  │             │  MEMORY ENTRY LIFECYCLE      │
                          │                     │             │                              │
                          │  decomposedBySkill?  │             │  NEW  (authored here)        │
                          │    yes → reinforce   │             │    │ importance = initial    │
                          │    no  → write soft  │             │    │ scope assigned          │
                          │    SKILL.md to       │             │    ▼ retrieved (scope=gen)  │
                          │    learned index     │             │  ACTIVE                     │
                          │                     │             │    │ importance += 0.1       │
                          │  skill failures →   │             │    │ accessCount++           │
                          │  episodic memory    │             │    ▼ not retrieved           │
                          │  scope=authoring    │             │  DECAYING                   │
                          │  shared experience →│             │    │ importance *= 0.8       │
                          │  episodic memory    │             │    ▼ below threshold         │
                          │  scope=general      │             │  PRUNED                     │
                          └──────────┬──────────┘             │                              │
                                     │                        │  procedural only:            │
                                    END                       │  importance >= 0.9           │
                                                              │  + accessCount >= 5          │
                                                              │    ▼                         │
                                                              │  → SKILL CANDIDATE           │
                                                              │    source entry retained     │
                                                              │    linked to learned skill   │
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
  │  procedural ── inject ─────►┼──┘    │  │  tool/script/skill call completes          │  │
  │                             │       │  │       │                                    │  │
  │  ◄── author (post-response) │       │  │  size <= threshold?                        │  │
  │  ◄── promote (from scratch) │       │  │    yes → PASS THROUGH                      │  │
  │                             │       │  │    no  ▼                                   │  │
  │  scope=general  → injected  │       │  │       WRITTEN                              │  │
  │  scope=authoring → internal │       │  │         │ full content → cold store        │  │
  │  scope=none → audit only    │       │  │         │ summary + ref → hot index        │  │
  │                             │       │  │         ▼  (summary shaped by output.schema)  │
  │  [decay job — periodic]     │       │  │       RETRIEVABLE                          │  │
  │    importance *= 0.8        │       │  │    (skill steps + LLM call scratchpad_read) │  │
  │    below threshold → PRUNED │       │  │         │                                  │  │
  │                             │       │  │  session ends                              │  │
  │  learned skill matched      │       │  │         ▼                                  │  │
  │  → reinforces source entry  │       │  │     PRE-FLUSH                              │  │
  └─────────────────────────────┘       │  │    index → memory author                   │  │
                                        │  │         ▼                                  │  │
  ┌──────────────────────────────┐      │  │  promote to LTM? ── yes ───────────────────┼──┼──► Long-Term Memory
  │     Checkpoint Store         │      │  │         │ no                              │  │
  │  namespace: [thread,threadId]│      │  │         ▼                                  │  │
  │                              │      │  │      FLUSHED                               │  │
  │  conversation history        │      │  └────────────────────────────────────────────┘  │
  │  graph state snapshots       │      └──────────────────────────────────────────────────┘
  │  hot memory between nodes    │
  │  persists: across turns      │
  │  preserves: HITL pause state │
  └──────────────────────────────┘

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
  │    email-label-apply/         ← codified, Python 3.12                               │
  │      SKILL.md                                                                        │
  │      applyLabels.py                                                                  │
  │      applyLabels.test.py                                                             │
  │      pyproject.toml                                                                  │
  │      uv.lock                  ← lockfile ✅ required                                │
  │      .venv/                   ← per-skill isolated env (.gitignore)                 │
  │    archive-old-emails/        ← codified, Bash                                      │
  │      SKILL.md                 ← systemDependencies declared, no lockfile            │
  │      archive.sh               ← simple stateless command invocation only            │
  │    email-workflow/            ← compositional, runtime: none                        │
  │      SKILL.md                                                                        │
  │    _learned/                  ← auto-generated soft skills                          │
  │      summarise-and-report-a1b2c3/                                                    │
  │        SKILL.md               ← natural language steps only                         │
  │                                                                                      │
  │  Skill Index (in-memory, rebuilt on startup)                                        │
  │    per skill: id, keywords, status, preparedAt, lastFailure,                        │
  │               consecutiveFailures, successRate, runtimeRequired,                    │
  │               missingConfig[], missingSecrets[], missingSysDeps[]                   │
  │    learned skills additionally: sourceMemoryId, accessCount,                        │
  │               lastMatchedAt, promotionFlagged                                       │
  │    status: ready | unavailable | degraded | deprecated                              │
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
  │    → scratchpadContextMiddleware → focusedContextMiddleware → tokenBudgetMiddleware    │
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
                      │ OR by learned skill match event

ACTIVE (procedural only)  →  SKILL CANDIDATE
  when: importance >= 0.9 AND accessCount >= 5
  source entry retained and linked to learned skill — not pruned
```

| State | Description | Entry Trigger |
|---|---|---|
| `NEW` | Created with initial importance and scope assigned | `authorMemories` node |
| `ACTIVE` | Being retrieved and reinforced | Retrieved during hydration or skill match |
| `DECAYING` | Not retrieved or matched within decay window | Periodic decay job |
| `PRUNED` | Deleted — learned skill SKILL.md also removed if linked | Importance below threshold |
| `SKILL CANDIDATE` | Procedural entry flagged for promotion | Importance ≥ 0.9 + accessCount ≥ 5 |

**Injection scope** controls where a memory entry is visible. See [Memory Injection Scope](#memory-injection-scope).

---

### Skill Lifecycle

```
PROCEDURAL MEMORY
      │
      │ importance >= 0.9 + accessCount >= 5
      │ source entry retained, linked to skill
      ▼
LEARNED  (soft SKILL.md in _learned/, no scripts)
      │  decay: governed by source memory entry
      │  match event reinforces source entry importance
      │  accessCount >= promotion_review_threshold → flagged for review
      │
      │ human development workflow
      ▼
CODIFIED  (SKILL.md + scripts + lockfile/sysdeps + tests)
      │
      │ community review
      ▼
STATIC  ──── prep fails ──────────────────► UNAVAILABLE
  │          (missing runtime, lockfile,         │
  │           system dependency, config,         │
  │           secrets, or bad output contract)   │
  │               ▲                              │
  │               └────────── re-prep ───────────┘
  │
  ├── exec fails repeatedly ──► DEGRADED
  │    sub-skill fail halts        │
  │    parent → DEGRADED too       │
  │         ▲                      │
  │         └── failures resolve ──┘
  │
  └── successRate < threshold ──► DEPRECATED
```

| State | Description | Lockfile |
|---|---|---|
| `PROCEDURAL MEMORY` | Pattern in cold store | N/A |
| `LEARNED` | Soft SKILL.md in `_learned/`, decays with source memory entry | N/A |
| `CODIFIED` | Full skill package in `skills/` | ✅ JS/Python — not applicable for Bash |
| `STATIC` | Community-visible, versioned | ✅ JS/Python — not applicable for Bash |
| `UNAVAILABLE` | Prep failed — not matchable | N/A |
| `DEGRADED` | Matchable with warning — consecutive execution failures | N/A |
| `DEPRECATED` | Removed from active matching | N/A |

**`UNAVAILABLE`** is triggered by any prep failure: runtime version mismatch, missing lockfile (JS/Python), missing system dependency (Bash), unresolvable required config, unresolvable required secret, or invalid output contract declaration.

**Learned skill decay** is governed entirely by the source procedural memory entry. When a learned skill is matched, a reinforcement event (`importance += 0.1`) is fired against the source entry — the same signal as a memory retrieval. If the skill stops being matched, the source entry decays normally. When the source entry is pruned, the linked SKILL.md is removed from `_learned/`.

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
| `scratchpad_read` | LLM or skill step — on demand | During reasoning or skill execution |

### Memory Injection Scope

Every memory entry carries an `injectionScope` controlling where it is visible. This prevents operational failures from poisoning routing decisions while preserving shared experience.

| Scope | Injected into | Written by | Examples |
|---|---|---|---|
| `general` | All requests via middleware | `authorMemories` | User preferences, session summaries, shared experiences |
| `authoring` | Internal agents only | `authorMemories` | Skill execution failures, operational detail |
| `none` | Never injected | `authorMemories` | Audit trail entries |

**The critical rule:** System state is never written to the memory system at any scope. Skill availability, runtime health, config resolution status, and prep outcomes live exclusively in the Skill Index and are injected live by `skillStatusMiddleware`.

**Shared experience vs. system state:**

```
System state (index only, never memory):
  "email-inbox is unavailable — GMAIL_CLIENT_ID not configured"
  ← binary, authoritative, current, changes when resolved

Operational fact (scope=authoring, memory):
  "email-inbox script exited code 1 during task X"
  ← historical detail for skill authoring agents

Shared experience (scope=general, memory):
  "During the email session on 2026-05-06, the inbox skill was
   unavailable. The task was completed using an alternative approach."
  ← narrative, past tense, no current-state claim, authored at session end
```

### Long-Term Memory Tiers

| Tier | Scope | Contains | Retention |
|---|---|---|---|
| **Episodic** | `general` | Shared experiences, session narratives | Medium — decays |
| **Episodic** | `authoring` | Operational failures, execution detail | Medium — decays |
| **Semantic** | `general` | Stable user facts, preferences | Long — reinforced |
| **Procedural** | `general` | Patterns that worked — source entries for learned skills | Long — promotes to skills |

---

## Context Hydration

### Session Hydration

Runs **once per thread**. Loads stable user context for the thread lifetime.

**Loads:** Semantic preferences, communication style, recent session summary, top procedural patterns.
**Does not load:** Specific past facts (per request), skills (skill matcher), skill status (live index).

### Request Hydration

Runs **before every request**, augmenting the session layer.

**Process:** Query cold store → score by keyword × importance → LLM filter → inject `scope=general` memories only.

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
  chunks: [{ index, content, keywords }],
  createdAt, sessionId
}
```

Graph state holds only `{ sessionId: string }` — never a class instance.

### On-Demand Retrieval

`scratchpad_read(ref, query)` returns top 1–2 keyword-scored chunks only. Available to both LLM steps and skill scripts via the platform's environment interface.

---

## Skills System

Skills are **named, portable, self-contained packages** encoding reusable approaches to recognised task types.

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
├── email-label-apply/                    ← codified (Python 3.12)
│   ├── SKILL.md
│   ├── applyLabels.py                    ← validates inputs, reads values from os.environ
│   ├── applyLabels.test.py
│   ├── pyproject.toml
│   └── uv.lock                           ← lockfile ✅ required
│
├── archive-old-emails/                   ← codified (Bash)
│   ├── SKILL.md                          ← systemDependencies declared
│   └── archive.sh                        ← validates inputs, simple stateless commands
│
├── email-workflow/                       ← compositional (runtime: none)
│   └── SKILL.md
│
└── _learned/                             ← auto-generated soft skills
    └── summarise-and-report-a1b2c3/
        └── SKILL.md                      ← linked to source procedural memory entry
```

`node_modules/` and `.venv/` are build artefacts — generated by prep, excluded from version control. Bash skills have neither — the filesystem is their environment.

### The SKILL.md Format

**YAML frontmatter** — machine-readable metadata for the Skill Loader, matcher, and prep system.

**JavaScript / Python skill:**

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

**Bash skill:**

```yaml
---
name: Archive Old Emails
version: 1.0.0
description: Move emails older than 90 days to the archive mailbox
keywords: [email, archive, cleanup, mailbox]
type: atomic
runtime:
  language: bash
  systemDependencies:
    - curl
    - jq
inputs:
  mailbox: { type: string, required: true }
---
```

**`runtime.version` is omitted for Bash** — no version management is applied. Bash skills must avoid version-specific features. If a script requires bash 4+ features (e.g. associative arrays), it must be rewritten in Python or JavaScript.

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
| `./script.sh --arg {value}` | Direct execution — zero LLM tokens |
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

**The schema has three consumers — the LLM is not one of them:**

| Consumer | What they use | Why |
|---|---|---|
| `summariserAgent` | `type` + `items` shape | Produces a summary appropriate to the data type |
| Skill Index / `lastFailure` | `codes` map | Translates exit codes to human-readable reasons |
| Community skill browser | Full `output` block | Documents what the skill produces |

Inter-step data flow is the responsibility of the compositional skill's prescribed steps, not the output contract. The SKILL.md steps guide the LLM in reasoning over prior step output — that is inference work, not a platform concern. Large intermediate results are passed between steps via the scratchpad.

### Atomic Skills

Does one thing. May mix script steps and LLM steps. Every script step declares an `output` block including explicit codes for input validation failures. Steps may read from and write to the scratchpad.

### Compositional Skills

Orchestrates other skills via `skill:` references. No scripts, no runtime, no lockfile, no config, secrets, system dependencies, or output declarations of its own. All of these are declared and satisfied at the atomic skill level.

**Failure propagation:** if any sub-skill fails, the compositional skill halts immediately. The failure propagates up and is recorded against the compositional skill in the Skill Index — the same as an atomic skill execution failure. Partial results from completed sub-skills are not used.

**The RLM system and the skill system are the same system.** `maxDepth` naturally prevents infinite nesting.

### Static and Learned Skills

| Type | Scripts | Lockfile | Config/Secrets | Output Contract | Input Validation | Reliability |
|---|---|---|---|---|---|---|
| **Learned** | ❌ | N/A | ❌ | ❌ | LLM best-effort | Variable |
| **Codified (JS/Python)** | ✅ Tested | ✅ Committed | Declared | ✅ Per step | ✅ Explicit exit codes | High |
| **Codified (Bash)** | ✅ Simple only | N/A | Declared | ✅ Per step | ✅ Explicit exit codes | Moderate |
| **Static** | ✅ Reviewed | ✅ Reviewed | Reviewed | ✅ Reviewed | ✅ Reviewed | Highest |

### Skill Matching

```
Stage 1: Keyword pre-filter
  → reads frontmatter index only
  → excludes status != "ready"
  → returns candidate list
  → no candidates → router immediately

Stage 2: Deterministic ranking + LLM confirmation
  → rank candidates by:
      1. Maturity:    STATIC > CODIFIED > LEARNED
      2. Reliability: higher successRate wins
      3. Specificity: fewer keywords = more specific = preferred
      4. Recency:     most recently matched wins
  → LLM confirms top-ranked candidate only
  → confidence >= 0.7 required
  → LLM not presented with full candidate list

match  →  applySkill (full SKILL.md loaded, steps typed and queued)
          match event fires reinforcement against source memory entry
          (learned skills only)
no match  →  router
```

**The ranking is deterministic.** The LLM's role in Stage 2 is confirmation, not selection. Consistent routing to higher-reliability skills is a platform responsibility, not an inference decision.

### Skill Execution

**Script — JavaScript / Python (zero LLM tokens)**
```
resolve {placeholders} from context
  │
  ▼
activate per-skill isolated environment
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

**Script — Bash (zero LLM tokens)**
```
resolve {placeholders} from context
  │
  ▼
inject config + secrets as environment variables
  (no isolated environment — system bash, declared deps already verified)
  │
  ▼
execute in network-restricted sandbox
  script validates own inputs → exit non-zero with documented code if invalid
  stdout → result (interpreted using output.schema)
  stderr → diagnostics
  │
  ▼
exit 0:   output → scratchpad if large, else direct
exit != 0: look up code in output.codes
           record in lastFailure.mappedReason
           task → ERROR PATH
```

Scripts access values via standard environment variable APIs. Values are never passed as command-line arguments or written to disk.

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

### Skill Runtime Environments

#### Per-Skill Isolation (JavaScript and Python)

Each JS/Python codified skill gets its own isolated environment:
- **JavaScript** — `node_modules/` local to skill directory
- **Python** — `.venv/` local to skill directory

| What isolation costs | What isolation buys |
|---|---|
| Duplicate on-disk installs | No version conflicts between skills |
| More disk space per skill | Independent upgradeability |
| — | Safe deletion |
| — | Full reproducibility from lockfile |

Download duplication is mitigated by package manager caches (`~/.npm`, `~/.cache/pip`).

#### Bash — No Isolation

Bash skills run directly against the system environment. There is no isolated environment to create or activate. The declared `systemDependencies` are verified at prep time — the system must already have them installed. The platform does not install system dependencies on behalf of the skill.

#### Runtime Version (JavaScript and Python)

`runtime.version` specifies required major/minor:

```yaml
runtime:
  language: javascript
  version: "20"         # >= 20.0.0 < 21.0.0
```

Mismatch is a hard fail at prep time with a clear remediation message. Version managers (`nvm`, `pyenv`) are the supported mechanism for multi-version environments.

**Bash has no runtime version field.** Bash skills must be written to be version-agnostic. Any script requiring version-specific features should be implemented in Python or JavaScript instead.

#### Lockfiles (JavaScript and Python)

| Language | Accepted lockfiles |
|---|---|
| JavaScript | `package-lock.json` or `yarn.lock` — one per skill |
| Python | `uv.lock` or `poetry.lock` |
| Bash | None — system dependency checking only |

Platform installation always uses the lockfile. Re-resolution from manifest is never performed.

#### Skill Prep

**JavaScript / Python:**
```
platform skill prepare <name>
  → checks runtime version         — hard fail on mismatch
  → verifies lockfile present      — hard fail if missing
  → resolves all required config   — hard fail if any missing
  → resolves all required secrets  — hard fail if any missing
  → validates output contract      — hard fail if malformed
  → installs from lockfile into per-skill isolated environment
  → marks skill status = "ready"
```

**Bash:**
```
platform skill prepare <name>
  → for each entry in systemDependencies:
      command -v <dep>             — hard fail if not found
  → resolves all required config   — hard fail if any missing
  → resolves all required secrets  — hard fail if any missing
  → validates output contract      — hard fail if malformed
  → marks skill status = "ready"
  (no environment to install — verification only)
```

**All runtimes:**
```
platform skill prepare --all
  → preps all unprepared skills
  → skips runtime: none skills (no-op)
  → reports each failure with specific reason and remediation
```

Prep failure messages for missing system dependencies include the dependency name and a platform-appropriate install hint:

```
ERROR: missing system dependency: jq
  install on macOS:  brew install jq
  install on Ubuntu: apt install jq
```

#### Bash as a Last Resort Runtime

> **Bash skills should be reserved for simple, stateless invocations of system commands. Any task requiring conditional logic, data transformation, error handling, retries, or external API calls should be implemented in JavaScript or Python where it can be unit tested.**

The absence of a testing framework for Bash is not just an inconvenience — it means there is no way to verify a Bash skill's behaviour against its output contract before it runs in production. This directly limits how far a Bash skill can progress in the maturity model.

The practical line:

| Appropriate for Bash | Should be JavaScript or Python |
|---|---|
| Calling a single CLI tool, capturing output | Parsing or transforming that output |
| Moving, renaming, or archiving files | Any logic conditional on file contents |
| Checking if a file or directory exists | Calling an API or handling auth |
| Piping two commands together | Anything with retry or pagination |
| — | Anything you would want to write a test for |

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
  id, name, keywords, description, type,
  status:              "ready" | "unavailable" | "degraded" | "deprecated"
  preparedAt?:         number
  runtimeRequired?:    string          // "node 20.x" — JS/Python only
  missingConfig:       string[]        // names of unresolved required config
  missingSecrets:      string[]        // names of unresolved required secrets
  missingSysDeps:      string[]        // Bash only — unmet system dependencies

  // Learned skills only
  sourceMemoryId?:     string          // linked procedural memory entry
  lastMatchedAt?:      number          // timestamp of most recent match
  promotionFlagged?:   boolean         // true when accessCount >= promotion_review_threshold

  lastFailure?: {
    type:              "prep" | "execution"
    reason:            string          // human-readable, no secret values
    occurredAt:        number
    runtimeFound?:     string          // "node 22.4.0" — JS/Python only
    exitCode?:         number          // execution failures
    mappedReason?:     string          // from output.codes map
    fromSubSkill?:     string          // sub-skill id if failure propagated from child
  }
  consecutiveFailures: number
  successRate:         number
}
```

**State transitions:**

```
prep fails (any reason)  →  status = "unavailable", lastFailure recorded
re-prep succeeds         →  status = "ready", all failure fields cleared

execution fails (script) →  exit code looked up in output.codes
                            lastFailure recorded, consecutiveFailures++
                            episodic memory written (scope=authoring)
                            consecutiveFailures >= threshold → "degraded"

sub-skill fails          →  parent halts immediately
                            lastFailure.fromSubSkill = failing skill id
                            parent consecutiveFailures++
                            parent → "degraded" if threshold reached

execution succeeds       →  consecutiveFailures = 0
                            successRate recovers → "ready"

successRate < threshold  →  "deprecated"

learned skill matched    →  lastMatchedAt updated
                            reinforcement event fired on sourceMemoryId
                            (importance += 0.1 on source procedural entry)
                            accessCount >= promotion_review_threshold
                            → promotionFlagged = true

source memory pruned     →  linked SKILL.md removed from _learned/
                            Skill Index entry removed
```

**Memory written on failure:**

```
scope=authoring:
  "email-workflow failed: sub-skill email-inbox exited code 1
   (Missing credentials) during task X"

scope=general (authored at session end):
  "During the email session on 2026-05-12, the email workflow skill
   failed partway through. The task was completed using an alternative approach."
```

**Never written to memory:** availability status, config/secret/dependency failures, prep outcomes, sub-skill failure chains.

### Skill Authoring

#### Track 1 — Emergent (Automatic)

Soft SKILL.md written to `_learned/`. Runtime `none`, no config, secrets, system dependencies, or output contract. Source procedural memory entry is retained and linked. Decay is governed by the source entry — matching the skill reinforces it.

#### Track 2 — Deliberate (Human)

```
1. IDENTIFY — mechanical vs. reasoning steps
             choose runtime: bash only for simple stateless commands,
             javascript or python for anything requiring logic or tests

2. BUILD
   JS/Python: write scripts,
              validate inputs at script start — exit non-zero with
              documented code if required inputs missing or invalid,
              read all config/secrets from env,
              write unit tests (mock env vars, test invalid input paths),
              generate lockfile
   Bash:      write script, validate inputs, keep simple and stateless,
              declare all system dependencies,
              no lockfile — verification only

3. COMPOSE  — write SKILL.md:
                runtime.language + runtime.version (JS/Python)
                runtime.systemDependencies (Bash)
                config + secrets entries
                output.codes including input validation codes
                output.schema per script step
                scratchpad usage noted in step descriptions if applicable

4. VERIFY
   JS/Python: unit tests pass (success + all non-zero paths
              including invalid input paths),
              integration test end-to-end,
              platform skill prepare succeeds
   Bash:      manual test on clean environment,
              verify all systemDependencies declared,
              platform skill prepare succeeds,
              document known limitations
```

### Skill Maturity Model

```
EMERGENT  → inference-only, auto-generated
            no config/secrets/sysdeps, no output contract
            decays with source procedural memory entry
                │ human development workflow
CODIFIED  → scripts + LLM, output contract per step,
            config + secrets declared,
            input validation with explicit exit codes,
            JS/Python: lockfile + runtime version + unit tests
            Bash: systemDependencies + manual verification only
                │ community review
VERIFIED  → community reviewed, all contracts documented,
            input validation reviewed,
            successRate tracked
            JS/Python: full test coverage, highest reliability
            Bash: limited to simple commands, no test coverage
```

> **A skill gets more reliable as more of its mechanical steps become code. The LLM is reserved for what only a model can do. Bash is a convenience for simple system calls — not a substitute for testable code.**

---

## Security Surface

### Script Sandbox Constraints

All scripts — JavaScript, Python, and Bash — execute in a **network-restricted sandbox**. This is the single non-negotiable constraint applied to every skill script execution regardless of runtime or deployment environment.

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
- A script that consumes excessive CPU or memory (resource limits are a deferred decision)

### Supply Chain

The platform relies on the package manager's built-in integrity verification:

- **npm** verifies package integrity against `package-lock.json` hashes at install time
- **uv / pip** verifies against `uv.lock` / `poetry.lock` hashes at install time

This is the supply chain guarantee: two installs from the same lockfile on the same platform will produce byte-identical environments, and any tampered package will fail hash verification before it is installed.

**The platform does not perform additional package verification beyond what the package manager provides.** Additional supply chain hardening is a deployment-level concern for operators with elevated security requirements.

### Deferred Security Concerns

| Concern | Deferred rationale | Preferred approach when addressed |
|---|---|---|
| **Input sanitisation** (placeholder injection) | Low immediate risk for trusted skill authors; affects Bash most acutely | Escape all `{placeholder}` values before shell interpolation; use argument arrays for JS/Python subprocesses |
| **Secret exfiltration via stdout** | Requires a redaction pass on all script output | Exact-match scan of stdout against known secret values before scratchpad write; replace matches with `[REDACTED]` |
| **Community skill trust levels** | No skill store planned at this time | Define trust tiers (verified, community, unreviewed) with `requiresConfirmation` defaults per tier |
| **Resource limits** (CPU, memory, time) | Highly deployment-dependent | Timeout and memory cap configurable per skill; enforced at sandbox level |

---

## Recursive Language Models (RLM)

> **Source**: Zhang & Khattab, MIT CSAIL — *Recursive Language Models* (Oct. 2025). [arxiv.org/abs/2512.24601](https://arxiv.org/abs/2512.24601v1)

### What RLMs Are

An RLM is a **thin wrapper around a language model** that can spawn recursive LM calls for intermediate computation. From the caller's perspective it is identical to a standard model call — `rlm.completion(messages)` is a drop-in replacement for `lm.completion(messages)`. The difference is what happens under the hood.

The key insight is a **context-centric view** of decomposition rather than a problem-centric one. Prior agentic systems decompose tasks; RLMs decompose the *context itself*. The context is an object to be understood by the model — code execution and recursive sub-calls are the means of understanding it efficiently.

### The Problem: Context Rot

"Context rot" is the empirically observed degradation in model reasoning quality as the context window fills. A model that performs well on short contexts makes progressively more errors on long ones — not because of token limits, but because longer sequences fall outside training distributions and incur higher-entropy attention patterns.

RLMs address context rot without solving it at the architecture level. No single model call ever sees the entire context. The root LM sees only the query; the context lives in an environment the root LM can query selectively.

### Mechanism: REPL Environment

The platform provides the root LM with a **REPL environment** (analogous to a Python notebook) in which the full context is pre-loaded as a variable. The root LM writes code cells to interact with this context:

```
User query
    │
    ▼
Root LM (depth=0)
  sees: query only + context metadata (size, type)
  interacts via: REPL cells (peek, grep, slice, call sub-LM)
    │
    ├── REPL cell: peek at first N chars to observe structure
    ├── REPL cell: grep/regex to narrow lines of interest
    ├── REPL cell: partition context + map recursive LM calls over chunks
    └── REPL cell: FINAL(answer) or FINAL_VAR(variable_name)
         │
         ▼
    Recursive LM (depth=1)
      sees: one chunk of context + sub-query
      returns: partial result to root LM's REPL environment
```

When the root LM is confident in its answer it emits `FINAL(answer)` (inline) or `FINAL_VAR(var)` (from a REPL variable holding a built-up result).

### Recursive Depth

The platform implements **depth=1** by default — the root LM can call leaf LMs, but those leaf LMs cannot themselves spawn further recursive calls. This is sufficient for most long-context tasks. Deeper recursion (`maxDepth > 1`) is supported but reserved for tasks that genuinely require it, as cost and latency grow with each level.

```
matchSkill → no match → router → "simple"  → single leaf agent
                               → "complex" → RLM (root LM + REPL + recursive sub-calls)
```

### Emergent Interaction Strategies

The root LM autonomously selects how it interacts with the context. The following strategies emerge without being explicitly programmed:

| Strategy | Description |
|---|---|
| **Peeking** | Read the first N characters to observe structure before committing to a retrieval plan |
| **Grepping** | Use keyword or regex patterns to narrow the search space without semantic retrieval |
| **Partition + Map** | Chunk the context into equal slices and run a recursive LM call over each to extract partial results |
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

### Performance Characteristics

Based on the published research:

- **OOLONG (132k tokens)**: RLM(GPT-5-mini) outperforms GPT-5 by >33% raw score at roughly equal API cost
- **BrowseComp-Plus (1000 documents / ~10M tokens)**: RLM is the only approach to maintain performance at this scale; base model approaches degrade sharply past 40 documents
- **Scaling**: RLM performance degrades gracefully as context grows; base model performance collapses

### Limitations

- Recursive sub-calls are **blocking by default** — no prefix caching or parallelism across chunks
- **Cost and latency are not bounded**: a partition+map strategy over a very large context can be expensive; the platform does not currently cap total RLM cost per request
- Performance on counting and numerical aggregation tasks degrades at very large context sizes even with RLMs
- The interaction strategies that emerge are **not reproducible** — the same query over the same context may produce different REPL trajectories across runs

---

## Tool System

### Platform Tools vs. Skill Scripts

| | Platform Tools | Skill Scripts |
|---|---|---|
| **Registration** | Central registry | Co-located with skill |
| **Scope** | Any agent | Owning skill only |
| **Selection** | `toolSelectorAgent` | Resolved from SKILL.md |
| **Dependencies** | Platform-managed | Per-skill isolated env (JS/Python) or system (Bash) |
| **Config/secrets** | Platform-managed | Declared in SKILL.md, injected as env vars |
| **Output contract** | `outputMaxChars` threshold only | `output.codes` + `output.schema` per step |
| **Input validation** | Platform responsibility | Script responsibility — explicit exit codes |
| **Network access** | Unrestricted | Restricted by default |
| **Scratchpad access** | Via tool output interception | Read and write during execution |
| **Examples** | `web_search`, `read_file` | `getEmails.js`, `applyLabels.py`, `archive.sh` |

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

For skill scripts, `summariserAgent` uses `output.schema` to shape the summary. For platform tools, output is treated as text.

### Human-in-the-Loop (HITL)

`requiresConfirmation: true` triggers an interrupt. Graph pauses, resumes on `approve` / `edit` / `reject`.

---

## Middleware Layer

> **Middleware handles constraints. The graph handles coordination. Scripts handle deterministic work.**

Script execution bypasses middleware — it only applies to LLM calls.

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

**`skillStatusMiddleware`** injects a live block from the Skill Index — never from memory:

```
[system — skill status]
Available:   email-inbox, email-label-ads, email-label-apply,
             archive-old-emails, email-workflow
Unavailable: email-label-keyword (missing secret: GOOGLE_API_KEY)
             archive-reports (missing system dependency: pandoc)
Degraded:    email-label-apply (3 consecutive failures — check logs)
Flagged:     summarise-and-report (learned skill — review for promotion)
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
| `skillConfirmationAgent` | ❌ | Stage 2 — confirm top-ranked candidate |
| `skillAuthoringAgent` | ❌ | Evaluate for skill promotion |
| `toolSelectorAgent` | ❌ | Select platform tools per task |
| `summariserAgent` | ❌ | Summarise large outputs — uses `output.schema` for script outputs |

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
RLMState {
  goal, userRequest, userId,
  scratchpadRef:     { sessionId: string }
  branch:            "simple" | "complex" | null
  taskQueue:         Task[]
  currentTask:       Task | null
  results:           TaskResult[]
  finalAnswer:       string
  injectedMemories:  string | null     — scope=general only
  availableTools:    RegisteredTool[]
  selectedTools:     RegisteredTool[]
  matchedSkill:      Skill | null
  decomposedBySkill: boolean
  maxDepth:          number
}

Task {
  id, description, parentId, depth,
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
  │             (fire reinforcement on source memory if learned skill)
  │
  └── no match → router
                   ├── simple → selectTools → simpleExecute → authorMemories → END
                   └── complex → decompose ◄──────────────────────────────────┐
                                     │                                         │
                                 currentTask? ── no ──────────────────────── ►│
                                     │ yes
                                     ▼
                                 resolveStep
                                   ├── script (JS/Python)
                                   │     activate env → inject config + secrets
                                   │     network-restricted sandbox execute
                                   │     (script validates own inputs)
                                   │     interpret output → COMPLETE
                                   │     exit != 0 → ERROR PATH
                                   ├── script (Bash)
                                   │     inject config + secrets (system env)
                                   │     network-restricted sandbox execute
                                   │     (script validates own inputs)
                                   │     interpret output → COMPLETE
                                   │     exit != 0 → ERROR PATH
                                   ├── sub-skill → push steps (depth+1) → QUEUED
                                   │     sub-skill fails → halt parent → ERROR PATH
                                   │     record parentSkillId in lastFailure
                                   └── LLM → selectTools → leafAgent → COMPLETE
                                                  (may read/write scratchpad)
                                                        │
                                                    aggregate → queue empty?
                                                        │ yes
                                                    authorMemories + maybeAuthorSkill → END
```

### Session Persistence

Checkpointer provides: conversation history across turns, process restart resumability, HITL pause/resume, per-`thread_id` isolation.

---

## The Self-Improving Loop

```
Day 1 — new task type:
  No skill match → LLM decomposes → executes
  → maybeAuthorSkill writes soft SKILL.md to _learned/
  → source procedural memory entry retained and linked

Next similar request:
  Learned skill matches → deterministic ranking puts it at Stage 2
  → LLM confirms → match event reinforces source memory entry
  → consistent decomposition, no re-decomposition needed

Learned skill used frequently but never promoted:
  accessCount reaches promotion_review_threshold
  → promotionFlagged = true in Skill Index
  → skillStatusMiddleware surfaces flag to operator
  → human reviews: promote to codified or leave as learned

Learned skill stops being used:
  match events stop → source memory entry no longer reinforced
  → importance decays over decay_window
  → importance < prune_threshold → source entry pruned
  → linked SKILL.md removed from _learned/ automatically

Community identifies pattern:
  Author chooses runtime:
    Simple system command?  → Bash, declare systemDependencies
    Needs logic or tests?   → JavaScript or Python

  Deliberate authoring:
    JS/Python: scripts with input validation + explicit exit codes,
               unit tests covering invalid input paths,
               lockfile, runtime version, config + secrets,
               output contract
    Bash:      simple script with input validation,
               systemDependencies, output contract,
               manual verification on clean environment

Skill deployed:
  platform skill prepare → all checks pass → status = ready
  Script steps: network-restricted, inputs validated at script start
  Compositional skills: sub-skill failure halts parent immediately

Conflict between two matched skills:
  Deterministic ranking selects higher-maturity / higher-reliability skill
  LLM confirms top candidate only — no selection from full list
  Routing is consistent and testable

Over time:
  JS/Python skills  → fully testable, input validation reviewed
  Bash skills       → simple, fast, explicitly limited scope
  Learned skills    → decay or get promoted — no indefinite accumulation
  Conflict routing  → deterministic, reliability-biased
  System state      → always in index, never in memory
```

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
| Skill review and approval workflow | Manual queue, automated gates, community voting |
| Script sandbox runtime | Node.js subprocess, Deno, Python venv, WASM |
| Bash sandbox constraints | Docker network layer (recommended) or OS-level restriction |
| Script timeout and resource limits | Deployment dependent — configurable per skill |
| Shared skill environments | Per-skill isolation (default) → shared per-language → content-addressable store |
| Multi-agent topology | Supervisor, peer-to-peer, shared state |
| Supply chain hardening | Package signing, provenance attestation — for elevated security deployments |
| Input sanitisation | Escape `{placeholder}` values before shell interpolation; argument arrays for JS/Python |
| Secret exfiltration via stdout | Exact-match redaction pass on script stdout before scratchpad write |
| Community skill trust levels | Trust tiers with `requiresConfirmation` defaults — pending skill store decision |

### Transition Policies

```
Memory:
  initial_importance:      episodic=0.5, semantic=0.6, procedural=0.7
  decay_window:            default 7 days
  decay_factor:            default 0.8 per cycle
  prune_threshold:         default 0.05
  rescue_on_retrieval:     true (scope=general only)
  skill_match_reinforcement: importance += 0.1 on source procedural entry

Skills:
  learned_importance:           0.9
  learned_min_uses:             5
  promotion_review_threshold:   accessCount >= 20 without promotion (suggested)
  deprecation_threshold:        successRate < 0.6
  degraded_threshold:           consecutiveFailures >= 3 (suggested)

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
| Bash skill runtime | System shell (network-restricted) | Restricted subprocess |
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

> **Skills trust the platform. Skills declare what they need; the platform satisfies it. A skill that can be shared without bundling credentials is a skill the community can trust.**

> **Bash is a last resort. If a script needs logic, tests, or error handling, it belongs in JavaScript or Python. Simple commands deserve simple scripts — complex work deserves testable code.**

> **Network access is a privilege, not a default. Scripts are isolated from the network unless the operator explicitly decides otherwise. Filesystem access is bounded by the deployment environment — Docker is the recommended boundary.**