# Prompt System — Design Document

## Status
Draft — Not yet implemented

## Background

Agent behavior in LLMs is primarily controlled through prompt content. Currently, prompts
in this application are hardcoded strings scattered across the codebase (e.g.
`MEMORY_SYSTEM_PROMPT` in `agent-runtime.ts`). This means:

- Prompts cannot be changed without a code deploy
- There is no way to test a prompt change before it affects production agents
- There is no history of what changed between versions

The Prompt System addresses all three by treating prompts as mutable, versioned,
first-class entities — analogous to source code — and pairing them with an evaluation
framework to validate behavioral changes before deployment.

---

## Goals

1. Store prompts in the database so they are editable without a deploy
2. Allow prompts to be composed into Agent system prompts via template variables
3. Provide a UI to manage prompts (`/prompts`)
4. Provide an evaluation framework to validate prompt behavior before promoting a change
5. (Fast Follow) Apply the same eval tooling to Agent system prompts directly

---

## Concepts

### Prompt
A named, versioned document containing instructions or information consumed by an LLM.
Prompts are **snippets** — they are not full system prompts on their own. They are intended
to be injected into a larger system prompt via template variables.

**Example prompt record:**
```
name:        "tool-discovery-instructions"
description: "Instructs the agent to call discover_tools before listing capabilities"
content:     "Before listing your available tools or capabilities, always call the
               discover_tools tool to ensure your list is complete and up to date."
version:     3
```

### Template Variables
Agent system prompts (stored on the `Agent` record) may reference prompts by name using
a `{{prompt:name}}` syntax. At runtime, the agent runtime resolves these references and
interpolates the prompt content before sending to the LLM.

**Example agent system prompt:**
```
You are a helpful assistant named {{agent_name}}.

{{prompt:tool-discovery-instructions}}

{{prompt:memory-usage-instructions}}

Your personal goal is to help the user manage their schedule.
```

The UI should render a **live preview** of the resolved system prompt when the user is
editing an Agent's system prompt, so they can see exactly what the LLM will receive.

### Prompt Version
Every save to a prompt creates a new version record rather than a destructive update.
The `Prompt` record holds the current/active version. Previous versions are retained for
history and rollback.

### Evaluation Suite
A named collection of Eval Cases associated with a specific Prompt. Used to validate that
a prompt produces the desired behavior before promoting a new version.

### Eval Case
A single test case within a suite. Composed of:
- **Input**: A message or conversation to send to the LLM
- **Assertion**: The condition that must be true for the case to pass (see Assertion Types)

### Assertion Types (MVP)

#### `contains`
Passes if the response text contains the specified string (case-insensitive).

```json
{
  "type": "contains",
  "value": "discover_tools"
}
```

#### `tool_called`
Passes if the agent invoked the specified tool at any point during the run.

```json
{
  "type": "tool_called",
  "tool": "discover_tools"
}
```

#### `tool_called_with`
Passes if the agent invoked the specified tool with arguments matching the provided
partial object.

```json
{
  "type": "tool_called_with",
  "tool": "memory_store",
  "args": { "type": "goal" }
}
```

> **Future assertion types (post-MVP):** `not_contains`, `matches_regex`,
> `llm_judge` (rubric-based scoring via a second LLM call), `response_schema`
> (structured output validation).

### Eval Run
A recorded execution of an Evaluation Suite against a specific Prompt version. Stores
pass/fail per case, the actual response, and timing. Runs are immutable records — they
are never updated, only created.

---

## Data Model

```prisma
model Prompt {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  content     String
  version     Int      @default(1)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  versions    PromptVersion[]
  suites      EvalSuite[]

  @@map("prompts")
}

model PromptVersion {
  id        String   @id @default(uuid())
  promptId  String   @map("prompt_id")
  version   Int
  content   String
  createdAt DateTime @default(now()) @map("created_at")

  prompt    Prompt   @relation(fields: [promptId], references: [id])
  runs      EvalRun[]

  @@map("prompt_versions")
}

model EvalSuite {
  id          String     @id @default(uuid())
  promptId    String?    @map("prompt_id")
  name        String
  description String?
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  prompt      Prompt?    @relation(fields: [promptId], references: [id])
  cases       EvalCase[]
  runs        EvalRun[]

  @@map("eval_suites")
}

model EvalCase {
  id          String    @id @default(uuid())
  suiteId     String    @map("suite_id")
  description String?
  input       String    // JSON: { messages: [{role, content}] }
  assertion   String    // JSON: { type, ...params }
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  suite       EvalSuite @relation(fields: [suiteId], references: [id])

  @@map("eval_cases")
}

model EvalRun {
  id              String           @id @default(uuid())
  suiteId         String           @map("suite_id")
  promptVersionId String           @map("prompt_version_id")
  status          String           // "running" | "passed" | "failed" | "error"
  passCount       Int              @default(0) @map("pass_count")
  failCount       Int              @default(0) @map("fail_count")
  createdAt       DateTime         @default(now()) @map("created_at")
  completedAt     DateTime?        @map("completed_at")

  suite           EvalSuite        @relation(fields: [suiteId], references: [id])
  promptVersion   PromptVersion    @relation(fields: [promptVersionId], references: [id])
  results         EvalCaseResult[]

  @@map("eval_runs")
}

model EvalCaseResult {
  id         String   @id @default(uuid())
  runId      String   @map("run_id")
  caseId     String   @map("case_id")
  passed     Boolean
  actual     String   // JSON: raw LLM response or tool call log
  durationMs Int      @map("duration_ms")
  createdAt  DateTime @default(now()) @map("created_at")

  run        EvalRun  @relation(fields: [runId], references: [id])

  @@map("eval_case_results")
}
```

---

## API Routes

```
# Prompts
GET    /api/v1/prompts                        → list all prompts
POST   /api/v1/prompts                        → create prompt
GET    /api/v1/prompts/:id                    → get prompt (current version)
PUT    /api/v1/prompts/:id                    → update prompt (creates new version)
DELETE /api/v1/prompts/:id                    → archive prompt
GET    /api/v1/prompts/:id/versions           → list version history
GET    /api/v1/prompts/:id/versions/:version  → get specific version content

# Eval Suites
GET    /api/v1/prompts/:id/suites             → list suites for a prompt
POST   /api/v1/prompts/:id/suites             → create suite
GET    /api/v1/suites/:id                     → get suite + cases
PUT    /api/v1/suites/:id                     → update suite
DELETE /api/v1/suites/:id                     → delete suite

# Eval Cases
POST   /api/v1/suites/:id/cases               → add case to suite
PUT    /api/v1/cases/:id                      → update case
DELETE /api/v1/cases/:id                      → delete case

# Eval Runs
POST   /api/v1/suites/:id/runs                → trigger a run against current version
GET    /api/v1/suites/:id/runs                → list runs for a suite
GET    /api/v1/runs/:id                       → get run + results
```

---

## Runtime Behavior

### Template Resolution
`AgentRuntime` resolves `{{prompt:name}}` references at agent startup (or on each
invocation if prompts can change at runtime — TBD). The resolver:

1. Parses the system prompt for `{{prompt:*}}` tokens
2. Batch-fetches matching `Prompt` records from the DB
3. Substitutes content in place
4. Logs a warning if a referenced prompt name is not found (does not throw)

Built-in variables also resolved at this stage:
- `{{agent_name}}` → agent's name from the DB record

### Eval Run Execution
When a run is triggered:

1. Create an `EvalRun` record with `status: "running"`
2. For each `EvalCase` in the suite, in sequence:
   a. Resolve the prompt content for the target version
   b. Send the input messages to the LLM with the resolved prompt as system context
   c. Capture the full response including any tool calls
   d. Evaluate the assertion against the captured response
   e. Write an `EvalCaseResult` record
3. Update the `EvalRun` with final `status`, `passCount`, `failCount`, `completedAt`

Runs execute against a **specific prompt version** so results are reproducible.

---

## UI

### `/prompts` — Prompt Manager
- List of all prompts (name, description, version, last updated)
- Create new prompt button
- Click row → opens edit drawer/page

### Prompt Detail / Edit
- Name, description fields
- Content editor (code editor with monospace font)
- Version history sidebar (click to view previous version content, button to restore)
- Linked Eval Suites section with pass/fail badge from last run

### Eval Suite View
- List of Eval Cases with assertion summary
- "Run Suite" button → triggers a new Eval Run
- Run history list with pass/fail counts and timestamps
- Click a run → expand to see per-case results with actual output

### Agent System Prompt Tab (existing, modified)
- Existing text editor for system prompt content
- **Live Preview panel**: renders the resolved prompt with all `{{prompt:name}}`
  variables substituted inline, highlighted so the user can see which segments
  came from which prompt snippet
- Autocomplete for `{{prompt:` tokens (fetches prompt names from API)

---

## Fast Follow — Agent System Prompt Evals

The eval infrastructure described above is prompt-centric. A near-term follow-on would
allow Eval Suites to be attached to an **Agent** rather than a Prompt, running the full
resolved system prompt (including all injected snippets) through the same eval harness.

This requires:
- Making `promptId` on `EvalSuite` nullable and adding an optional `agentId` FK
  (nullable, mutually exclusive with `promptId`)
- Running the eval with the agent's fully resolved system prompt rather than a single snippet
- Surfacing a "Suites" tab on the Agent detail page

No schema changes to the core prompt/eval tables are required beyond the FK addition.

---

## Open Questions

- Should template resolution happen at **startup** (cached) or per-invocation (always
  fresh)? Fresh is safer during active prompt development; cached is better for performance.
- Should deleted/archived prompts that are still referenced in agent system prompts
  cause a hard error or a graceful fallback?
- Do we want a "promote to agents" workflow — i.e. a prompt version is explicitly
  promoted before agents pick it up — or does saving immediately affect all agents?
