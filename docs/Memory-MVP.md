# Memory System MVP

## Scope

This document defines the smallest production-ready implementation of the memory
architecture described in [Memory.md](Memory.md). The goal is a working scratchpad
that ships, collects real metrics, and provides a stable foundation for the full
feature set.

### What Is In Scope

- **Scratchpad** — LangGraph checkpoint field holding structured XML
- **Message trimming** — short-term buffer keeping the last N messages
- **Reflection** — `afterModel` LLM call to update the scratchpad
- **TTL pruning** — expiring sections to a graveyard
- **Metrics** — counters and timers instrumented at each middleware hook
- **Tests** — schema compliance, golden dataset, and integration archetypes

### What Is Explicitly Out of Scope

| Deferred Feature | Reason |
|---|---|
| Long-term memory (procedural / semantic / episodic) | Requires store design, promotion logic, and retrieval tools |
| Cold-start seeding from long-term memory | Depends on long-term memory |
| `recall_episodes` / `recall_knowledge` tools | Depends on long-term memory |
| Navigation LLM (Prompt 1) | Replace with full scratchpad inject; add when scratchpad grows too large |
| Auto-decomposition / re-composition (Prompts 3 & 4) | Add when `maxSectionSize` violations appear in metrics |
| Graveyard LLM summarization | Tombstone uses section `description` attribute; no LLM call |
| Graveyard injection on hard miss | No navigation = no hard miss concept in MVP |
| `triggerOrigin` / `triggerType` configurable | Logged but not acted on |

---

## Checkpoint State

Two new fields are added to the LangGraph checkpoint state, scoped to `thread_id`.
LangGraph persists and reloads them automatically alongside the message history.

```typescript
interface ScratchpadCheckpointState {
  // Monotonically incrementing counter. Never derived from messages.length.
  // Incremented once per turn (first beforeModel call only).
  turnCount: number;

  // Full scratchpad XML, serialized as a string.
  // Empty string on turn 1; initialized by beforeModel on first write.
  scratchpad: string;
}
```

A state guard prevents `beforeModel` from running more than once per turn
(LangGraph may call it multiple times within a single agentic step):

```typescript
// Stored in state; reset to false at the start of each outer turn.
__beforeModelHasRun: boolean;
```

---

## Per-Turn Lifecycle

```
HumanMessage (user or automation)
    │
    ▼
┌──────────────────────────────────────────────────┐
│              beforeModel (once per turn)          │
│                                                  │
│  1. Guard: skip if __beforeModelHasRun = true    │
│  2. Increment turnCount                          │
│  3. Load scratchpad from checkpoint              │
│  4. Inject full scratchpad XML into system msg   │
│     (skip if scratchpad is empty)                │
│  5. Trim messages[] to last recentTurns messages │
│  6. Set __beforeModelHasRun = true               │
│  7. Emit metrics: tokens_injected,               │
│                   messages_trimmed               │
└──────────────────────────────────────────────────┘
    │
    ▼
LLM Call
    │
    ▼
┌──────────────────────────────────────────────────┐
│           afterModel (each LLM call)             │
│                                                  │
│  1. Call reflection LLM with:                    │
│     - Incremental messages since last afterModel │
│     - Current TOC (names + descriptions only)    │
│     - Current turnCount                          │
│  2. Apply structured operations to scratchpad:   │
│     append | rewrite | remove                    │
│  3. Run pruning pass:                            │
│     - Compute effectiveTTL for all leaf sections │
│     - Expired sections → graveyard tombstone     │
│       (tombstone uses section description; no    │
│        LLM call required)                        │
│     - Prune expired tombstones from graveyard    │
│  4. Persist updated scratchpad to checkpoint     │
│  5. Emit metrics: ops_applied, sections_pruned,  │
│                   scratchpad_size_chars,         │
│                   reflection_latency_ms,         │
│                   reflection_errors              │
└──────────────────────────────────────────────────┘
    │
    ▼
Tool Calls (if any) → Tool Results → LLM Call
    [afterModel runs again for each LLM call]
    │
    ▼
AI Response
```

---

## Scratchpad XML Format

### Live Sections

```xml
<scratchpad>
  <toc>
    <entry name="article-setup" description="Setup steps from the fetched article" />
    <entry name="user-preferences" description="User communication style" />
  </toc>

  <sections>
    <section type="tool" name="article-setup"
             lastSelectedTurn="4" initialTTL="10">
      <content><![CDATA[
        Install with: npm install example-pkg
        Config file lives at ~/.example/config.yaml
      ]]></content>
    </section>

    <section type="text" name="user-preferences"
             lastSelectedTurn="2" initialTTL="5">
      <content><![CDATA[
        Prefers concise bullet-pointed responses.
        Prefers TypeScript over JavaScript in examples.
      ]]></content>
    </section>
  </sections>

  <graveyard>
    <entry
      name="article-intro"
      description="Article introduction covering the author's motivation"
      createdAtTurn="12"
    />
  </graveyard>
</scratchpad>
```

### TTL Calculation

Only leaf sections carry TTL attributes. Effectve TTL is computed lazily at read
time — never stored as a counter.

```
effectiveTTL = initialTTL - (turnCount - lastSelectedTurn)
expired      = effectiveTTL <= 0
```

`lastSelectedTurn` is written only at section creation (set to `currentTurn`) and
on selection (credited by `selectionCredit`, capped at `turnCount + sectionCreditCap`).
In the MVP, sections are always injected in full — every section in the scratchpad
is considered "selected" each turn it is non-empty, so `lastSelectedTurn` updates
on every `beforeModel` call where at least one section exists.

```
// beforeModel — update lastSelectedTurn for all live sections
lastSelectedTurn = min(
  lastSelectedTurn + selectionCredit,
  turnCount + sectionCreditCap
)
```

### Graveyard Tombstones

Tombstones use the expired section's `description` attribute as the summary.
No LLM call is needed. A fixed `graveyardTTL` countdown applies:

```
tombstoneEffectiveTTL = graveyardTTL - (turnCount - createdAtTurn)
```

Tombstones are pruned silently when `tombstoneEffectiveTTL <= 0`. They are never
surfaced to the agent in the MVP (no hard-miss navigation).

### Section Types and Default TTLs

| Type | `initialTTL` | Use for |
|---|---|---|
| `tool` | `10` | Content fetched by a tool call |
| `text` | `5` | General working notes |
| `text` (ephemeral) | `2` | Short-lived observations |

`ephemeral` is not a distinct type — it is a `text` section created with `initialTTL="2"`.
The reflection LLM selects 2 when the content is clearly transient.

---

## Reflection Prompt

> Treat this prompt as a code artifact. Changes go through PR review.
> File location: `backend/src/lib/agents/prompts/scratchpad-reflection.md`

**Input to the prompt:**

| | Included |
|---|---|
| ✅ | Incremental messages since last `afterModel` (role + content) |
| ✅ | Current TOC (names + descriptions only — not full section content) |
| ✅ | Current `turnCount` |
| ❌ | Full section content |
| ❌ | Full message history |
| ❌ | System prompt |
| ❌ | Graveyard entries |

**Structured output schema (Zod):**

```typescript
const ScratchpadOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('append'),
    name: z.string(),               // kebab-case, specific, not generic
    description: z.string(),        // one sentence
    type: z.enum(['tool', 'text']),
    initialTTL: z.number().int().min(1).max(10),
    content: z.string(),
  }),
  z.object({
    op: z.literal('rewrite'),
    name: z.string(),               // must match an existing TOC entry name
    content: z.string(),
  }),
  z.object({
    op: z.literal('remove'),
    name: z.string(),               // must match an existing TOC entry name
  }),
]);

const ReflectionOutputSchema = z.object({
  operations: z.array(ScratchpadOperationSchema),
});
```

**Prompt rules enforced by the template:**

- Zero operations is valid — not every LLM call produces scratchpad-worthy content.
  The filter: *"Would this be useful to a future turn with no access to the current
  message history?"*
- All section names must be kebab-case.
- Before creating a section, check the TOC — reuse the exact existing name if the
  content belongs there.
- Prefer `rewrite` over `append` when existing content would become misleading or
  redundant.
- Generic names (`notes`, `summary`, `info`, `misc`) are rejected by the schema
  via a Zod `.refine()` guard.
- Operate only on the current increment. Do not reorganize or rename sections not
  present in the increment.

**Error handling:**

On schema validation failure: retry once with a correction instruction. On second
failure: log error, skip update. A missed update is always preferable to a corrupted
scratchpad.

---

## Configuration

| Parameter | Default | Description |
|---|---|---|
| `recentTurns` | `8` | Messages kept in the short-term buffer |
| `selectionCredit` | `2` | Turns of credit added to `lastSelectedTurn` on each selection |
| `sectionCreditCap` | `10` | Maximum turns `lastSelectedTurn` can lead `turnCount` |
| `initialTTL.tool` | `10` | Default TTL for `tool`-type sections |
| `initialTTL.text` | `5` | Default TTL for `text` sections |
| `graveyardTTL` | `30` | Turns a tombstone survives before permanent removal |
| `maxSectionSize` | `800` | Character threshold — logged as a warning metric; no automatic split in MVP |

---

## Metrics

All metrics are instrumented directly in middleware — no LLM evaluation required.
Emit each metric as a structured log entry with at minimum: `thread_id`, `turn`,
metric name, and value.

### `beforeModel` Metrics

| Metric | Type | Description |
|---|---|---|
| `scratchpad.tokens_injected` | gauge | Approximate tokens in injected scratchpad XML (chars / 4) |
| `scratchpad.messages_trimmed` | counter | Messages removed by the short-term buffer this turn |
| `scratchpad.section_count` | gauge | Live section count at inject time |

### `afterModel` Metrics

| Metric | Type | Description |
|---|---|---|
| `scratchpad.reflection_latency_ms` | histogram | Time taken by the reflection LLM call |
| `scratchpad.reflection_errors` | counter | Reflection LLM call failures (includes retry failures) |
| `scratchpad.reflection_retries` | counter | First-attempt schema failures that triggered a retry |
| `scratchpad.ops.append` | counter | `append` operations applied this call |
| `scratchpad.ops.rewrite` | counter | `rewrite` operations applied this call |
| `scratchpad.ops.remove` | counter | `remove` operations applied this call |
| `scratchpad.ops.total` | counter | Total operations applied this call |
| `scratchpad.sections_pruned` | counter | Sections moved to graveyard this call |
| `scratchpad.tombstones_pruned` | counter | Graveyard entries permanently removed this call |
| `scratchpad.size_chars` | gauge | Full scratchpad XML size in characters after update |
| `scratchpad.section_size_exceeded` | counter | Sections exceeding `maxSectionSize` (warning only) |

### Interpretation Guidance

| Signal | Likely meaning |
|---|---|
| `ops.total = 0` consistently | Reflection is not capturing content — check prompt or model |
| `ops.append` >> `ops.rewrite` | Duplicate content accumulating in sections |
| `sections_pruned` = 0 across many turns | TTL values may be too high for the thread length |
| `size_chars` grows linearly with turn count | Pruning is not keeping up — check TTL config |
| `reflection_errors` > 0 | Reflection model is failing or returning non-schema output |
| `section_size_exceeded` > 0 | Content needs decomposition — implement Prompts 3 & 4 |
| `messages_trimmed` = 0 in long threads | Trimming is not firing — check `recentTurns` config |

---

## Tests

Tests are split into two groups by LLM dependency:

- **Unit tests** — no LLM, run on every CI push: `npm test`
- **LLM tests** — tagged `@llm`, require a live LLM, opt-in: `npm test -- --grep @llm`

### LLM Configuration for Tests

LLM tests use the same alias-driven config system as the application. Two
environment variables control which LLM is used:

| Variable | Description | Example |
|---|---|---|
| `CONFIG_DIR` | Path to a `config.yaml` containing `llm.apis` entries | `CONFIG_DIR=../config` |
| `TEST_LLM_ALIAS` | Alias of the LLM entry to use for reflection and evaluation calls | `TEST_LLM_ALIAS=local-ollama` |

If `TEST_LLM_ALIAS` is not set, the default alias in the config is used. The test
helper loads the config and instantiates an `LLMManager` directly — no Express app
or database required.

A recommended local setup for running `@llm` tests:

```bash
CONFIG_DIR=../config TEST_LLM_ALIAS=local-ollama npm test -- --grep @llm
```

LLM tests are excluded from CI by default. They should be run manually before
merging any change to the reflection prompt.

---

### Layer 1 — Schema Compliance (Unit, `@llm`)

Split into two sub-layers:

**1a — Pure unit (no LLM):** Validates the XML serialization helpers, TTL math,
pruning logic, and `apply operations` function in isolation.

| Test | Assert |
|---|---|
| `effectiveTTL` calculation at various `turnCount` values | Correct arithmetic; `expired = true` at boundary |
| `append` operation on empty scratchpad | Section added to `<sections>` and `<toc>` |
| `rewrite` operation on existing section | Content replaced; TTL attributes unchanged |
| `remove` operation on existing section | Section removed from `<sections>` and `<toc>` |
| Pruning pass: section with `effectiveTTL <= 0` | Moved to `<graveyard>` with correct `createdAtTurn` |
| Pruning pass: tombstone with expired `graveyardTTL` | Removed from `<graveyard>` |
| `lastSelectedTurn` credit cap | `min(lastSelectedTurn + credit, turnCount + cap)` |

**1b — Schema compliance (`@llm`):** Validates that the reflection prompt reliably
produces output matching the Zod schema. Use fixed inputs; assert schema conformance
only — not content correctness.

| Input | Assert |
|---|---|
| Empty incremental messages, empty TOC | `operations: []` |
| Non-empty incremental messages, empty TOC | Valid schema; `append` operations only |
| Non-empty messages, TOC with 20 sections | Valid schema; all `rewrite` names exist in TOC |
| Intentionally malformed first response from LLM | Retry triggered; second attempt succeeds |
| Two consecutive malformed responses | Schema error logged; empty operations returned |
| `append` with a generic name (`notes`, `summary`) | Rejected by Zod `.refine()` guard |

### Layer 2 — Operation Correctness, Golden Dataset (`@llm`)

Fixed deterministic inputs with known correct operations. Re-run on every prompt
change. Use `mocha` with snapshot assertions so regressions are immediately visible.

**Reflection scenarios:**

| Scenario | Expected operations |
|---|---|
| Tool returns an article the user asked to read | `append` to a new specific section name |
| User corrects a preference from two turns ago | `rewrite` of the preferences section |
| User says "forget what I said about X" | `remove` of the relevant section |
| Small-talk exchange with no actionable content | Zero operations |
| Tool returns data partially updating prior data | `rewrite`, not `append` |
| Second consecutive message about the same topic | `rewrite` of existing section, not a second `append` |
| New content clearly matches an existing TOC entry | Reuses the existing section name exactly |
| New content is a new distinct topic | `append` with a new specific kebab-case name |
| Reflection proposes name `notes` | Caught as a schema violation |

### Layer 3 — Scratchpad Quality Over Time, Integration (`@llm`)

A lightweight test harness that:

1. Replays a scripted multi-turn conversation against a real LLM
2. Snapshots the scratchpad XML after each turn
3. At defined checkpoints, asks an evaluator LLM: *"Given this scratchpad state and
   the next user message, does the agent have the context it needs to respond
   correctly? Answer yes or no and give a one-sentence reason."*
4. Records `scratchpad.size_chars` at each turn to detect bloat

**Required conversation archetypes:**

| Archetype | Turns | What it validates |
|---|---|---|
| **Deep dive** | 15 | One topic explored in depth; sections should grow then stabilize |
| **Context switch** | 12 | User abruptly changes topics; old sections should expire gracefully |
| **Return** | 15 | User leaves a topic, discusses something else, then returns; returning sections should still be live or graveyarded |

Each archetype test passes if:
- The evaluator LLM answers "yes" at all designated checkpoints
- `scratchpad.size_chars` at the final turn is ≤ 2× the size at turn 5
- No `reflection_errors` recorded during the run

---

## Implementation Order

A suggested sequence that keeps each step independently testable:

1. **Checkpoint state** — add `turnCount` and `scratchpad` annotations to the
   LangGraph state definition; write serialization helpers for the XML format
2. **`beforeModel`** — implement turn counter, scratchpad inject, message trim;
   emit metrics
3. **Reflection prompt** — write and test the prompt file; define the Zod output
   schema
4. **`afterModel`** — wire reflection LLM call, apply operations, run pruning,
   persist; emit metrics
5. **Layer 1 tests** — schema compliance suite against the reflection prompt
6. **Layer 2 tests** — golden dataset
7. **Layer 3 tests** — integration harness with all three conversation archetypes

Steps 1–4 can ship together as the first deployable unit. Steps 5–7 gate promotion
to production.
