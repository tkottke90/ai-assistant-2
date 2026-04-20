# Evaluations — PromptFoo Test Suite

This directory contains [PromptFoo](https://promptfoo.dev) evaluation configs for testing agents and LLM
behavior against the running backend.

## Directory layout

```
test/
├── README.md                    # This file
├── agent-eval-base.yaml         # Reference template for live agent eval configs
├── base.yaml                    # Base config for direct LLM prompt tests
├── providers.yaml               # Shared LLM provider definitions
│
├── Memory.config.yaml           # Memory & scratchpad eval
├── Hermes.config.yaml           # Hermes agent eval
├── Hephaestus.config.yaml       # Hephaestus agent eval
│
├── fixtures/                    # Reusable turn-sequence fixtures (JSON arrays)
│   └── lighthouse-recall.json   # 5-turn fact-recall conversation
│
├── providers/
│   └── agent-provider.mjs       # Custom PromptFoo provider — calls the backend's
│                                 # /api/v1/chat endpoint and handles multi-turn turns
│
├── promptfoo-assertions.ts      # Custom Chai assertions (toPassLLMRubric, etc.)
├── chat-fixture.json            # Message template for direct LLM tests
└── multi-turn-chat-fixture.json # Message template for multi-turn direct LLM tests
```

## How the setup works

### Provider

All agent evals use the custom provider at `providers/agent-provider.mjs`.  
It:

1. Creates a real thread via `POST /api/v1/chat/new-thread`
2. Sends each turn sequentially to `POST /api/v1/chat`, consuming the chunked stream
3. Fetches the scratchpad state from `GET /api/v1/chat/:threadId/scratchpad` after each turn
4. Deletes all created threads during `cleanup()` so the backend stays clean

The final LLM response plus embedded metadata is returned as the `output` string:

```
<agent response text>
<!--EVAL_METADATA={"toolsUsed":[],"stats":{},"scratchpad":"...","threadId":"...","allTurns":[...]}-->
```

Assertions parse this comment to access `scratchpad`, `toolsUsed`, `allTurns`, etc.

### Single-turn vs multi-turn tests

| Pattern | `vars` key | Example |
|---------|-----------|---------|
| Single turn | `message` | `message: "Can you remember that I prefer short answers?"` |
| Multi-turn (inline) | `messages` (JSON string) | `messages: '["Turn 1", "Turn 2"]'` |
| Multi-turn (fixture file) | `messages` (file reference) | `messages: "file://fixtures/my-fixture.json"` |

For multi-turn tests, `messages` must be a JSON array of strings (one per turn).  
Using a JSON string or a `file://` reference prevents PromptFoo from expanding arrays
into separate test cases.

### LLM judge (llm-rubric)

Rubric assertions use the `OPENAI_API_BASE_URL` / `OPENAI_API_KEY` env vars defined in
each config to call an OpenAI-compatible endpoint for grading. The model is set via
`defaultTest.options.provider`.

---

## Prerequisites

The backend must be running before starting any eval:

```bash
cd backend && npm run dev
```

The agent under test must exist in the database with `agentId` matching the value in
the config's `defaultTest.vars.agentId`.

---

## Running an eval

```bash
cd backend

# Run a specific eval config
promptfoo eval -c test/Memory.config.yaml --no-cache --output evaluations/memory.results.json

# Run without writing output
promptfoo eval -c test/Memory.config.yaml --no-cache

# View results in the browser
promptfoo view
```

---

## Adding a fixture file

Fixture files live in `test/fixtures/` and contain a JSON array of turn strings:

```json
[
  "Turn 1 — user message",
  "Turn 2 — user message",
  "Turn 3 — user message"
]
```

Reference the fixture in a test with `file://fixtures/<name>.json`:

```yaml
vars:
  messages: "file://fixtures/my-fixture.json"
```

Fixture files are appropriate when:
- A conversation has more than 3 turns
- The same conversation is reused across multiple tests or configs
- The inline YAML would require excessive escaping (apostrophes, quotes)

---

## Adding a new test to an existing config

1. Open the relevant `*.config.yaml` file
2. Add a new entry under `tests:`
3. Choose a `description` that clearly states the behavior being verified
4. Provide `vars.message` (single-turn) or `vars.messages` (multi-turn)
5. Add one or more `assert` entries — see assertion types below

```yaml
- description: "Agent does X when user says Y"
  vars:
    message: "User input here"
  assert:
    - type: javascript
      value: |
        const meta = JSON.parse((output.match(/<!--EVAL_METADATA=(.*?)-->/) ?? ['','{}'])[1]);
        if (meta.error) throw new Error(meta.error);
        return true;
    - type: llm-rubric
      value: "Response does X without doing Z"
```

### Assertion types used in this project

| Type | Purpose |
|------|---------|
| `javascript` | Parse `EVAL_METADATA` and assert on `scratchpad`, `toolsUsed`, `allTurns`, etc. |
| `llm-rubric` | Ask the judge LLM whether the response meets a natural-language criterion |
| `contains` | Check that the output string contains a literal substring |

For scratchpad assertions, the pattern is:

```javascript
const meta = JSON.parse((output.match(/<!--EVAL_METADATA=(.*?)-->/) ?? ['','{}'])[1]);
const sp = meta.scratchpad ?? '';
if (!sp.toLowerCase().includes('expected term')) {
  throw new Error(`Scratchpad missing 'expected term'. Got: ${sp.slice(0, 200)}`);
}
return true;
```

---

## Adding a new eval config (new agent)

1. Copy `agent-eval-base.yaml` as a starting point
2. Set `description`, `evaluateOptions.timeout`, and `defaultTest.vars.agentId`
3. Add `env.OPENAI_API_BASE_URL` and `env.OPENAI_API_KEY` for the judge LLM
4. If the agent needs setup (e.g. an Obsidian note), set `providers[0].config.file` and
   `providers[0].config.content` — the provider's `setup()` method will create it
5. Write tests following the patterns above
6. Run with:
   ```bash
   promptfoo eval -c test/YourAgent.config.yaml --no-cache --output evaluations/youragent.results.json
   ```

---

## PromptFoo reference docs

| Topic | URL |
|-------|-----|
| Configuration reference | https://promptfoo.dev/docs/configuration/reference |
| Assertion types | https://promptfoo.dev/docs/configuration/expected-outputs |
| Custom providers | https://promptfoo.dev/docs/providers/custom-api |
| llm-rubric grading | https://promptfoo.dev/docs/configuration/expected-outputs/model-graded |
| CLI reference | https://promptfoo.dev/docs/usage/command-line |
