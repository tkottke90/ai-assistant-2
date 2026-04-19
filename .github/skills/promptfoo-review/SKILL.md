---
name: promptfoo-review
description: "Review a PromptFoo evaluation results JSON file. Use when analyzing eval results, reviewing test failures, diagnosing why an agent test failed, categorizing failures as prompt/test/harness issues, or generating refinement feedback from a *.results.json file produced by promptfoo eval."
argument-hint: "Path to a *.results.json file (e.g., backend/evaluations/memory.results.json)"
---

# PromptFoo Evaluation Review

## When to Use
- After running `promptfoo eval`, to analyze the output `*.results.json`
- To understand why specific tests passed or failed
- To distinguish whether a failure is the agent prompt, the test assertion, or the test harness
- To generate actionable feedback for improving prompts or tests

## PromptFoo Results JSON Structure

Key fields to navigate:

```
results.results[]             — Array of per-test result objects
  .gradingResult.pass         — Overall pass (true/false)
  .gradingResult.score        — Aggregate score (0.0–1.0)
  .gradingResult.reason       — Human-readable summary
  .gradingResult.componentResults[]  — Per-assertion results
    .pass                     — Assertion pass/fail
    .score                    — Assertion score
    .reason                   — Why it passed or failed
    .assertion.type           — "javascript" | "llm-rubric" | "contains" | etc.
    .assertion.value          — The assertion code or rubric text
  .error                      — Top-level error string (harness failure)
  .prompt.label               — The prompt label/template used
  .vars                       — Input variables for this test case
  .latencyMs                  — Response time in milliseconds

results.prompts[]             — Prompt-level aggregate metrics
  .metrics.testPassCount
  .metrics.testFailCount
  .metrics.score
```

## Review Procedure

### Step 1: Read and Parse the File

Read the provided `*.results.json` file. Extract:
- Total test count: `results.results.length`
- Pass count: count where `gradingResult.pass === true`
- Fail count: count where `gradingResult.pass === false`
- Any top-level `error` on individual results (harness errors)

### Step 2: For Each Test — Produce a Result Entry

For **every** entry in `results.results[]`, output:

```
### Test N — [PASS | FAIL] — Score: X.XX
Input: <vars.message or vars.messages summary>
<If PASS>: All assertions passed.
<If FAIL>: See failed assertions below.
```

For failed tests, list each failed `componentResult` (where `.pass === false`):

```
  - Assertion type: <type>
    Rubric/Code: <first 200 chars of assertion.value>
    Reason: <componentResult.reason — truncate stack traces after first 3 lines>
```

### Step 3: Categorize Each Failure

For every failed test, assign one of three failure categories using this decision tree:

#### HARNESS failure
Indicators (any one is sufficient):
- `result.error` is present AND the stack trace points to PromptFoo internal paths (e.g., `evaluator-*.js`, `promptfoo/dist/`)
- The assertion itself has a JavaScript syntax error or references undefined variables
- The failure reason is unrelated to the agent output (e.g., network error, timeout, provider failure)

#### TEST failure (assertion logic problem)
Indicators:
- The assertion is checking an implementation detail rather than observable behavior (e.g., checking internal state that may not always be populated, overly strict string matching)
- The assertion's error message suggests the condition was reasonable but the check was too brittle
- An `llm-rubric` assertion fails but the model output looks correct on inspection
- A `javascript` assertion throws because it checks for something that is a test-design assumption, not an agent requirement
- The same behavior passes other assertions in the same test

#### PROMPT failure (agent behavior problem)
Indicators:
- The agent did not do what was clearly asked in the input
- An `llm-rubric` assertion fails because the response genuinely misses the expected behavior
- A `javascript` assertion fails because the agent called wrong tools, omitted required output, or produced incorrect content
- The failure is consistent with a gap in the system prompt's instructions

When categorization is ambiguous, note both possibilities and explain the uncertainty.

### Step 4: Generate Feedback

After reviewing all tests, produce two sections:

#### Prompt Refinement Suggestions
For each PROMPT failure, suggest specific changes:
- What behavior the prompt should add, clarify, or emphasize
- If relevant, quote the failing rubric and propose what instruction would make the agent satisfy it

#### Test Refinement Suggestions
For each TEST failure, suggest:
- Whether the assertion should be loosened, rewritten, or removed
- If a `javascript` assertion is too implementation-specific, suggest an equivalent `llm-rubric` alternative
- If a rubric is ambiguous, suggest a more precise restatement

For HARNESS failures, note them separately and suggest checking the provider configuration, assertion code syntax, or PromptFoo version.

## Output Format

Produce the review as structured Markdown:

```markdown
## Evaluation Summary
- File: <filename>
- Timestamp: <results.timestamp>
- Total: N tests | P passed | F failed

---

## Test Results

### Test 1 — [PASS] — Score: 1.00
...

### Test 2 — [FAIL] — Score: 0.67
**Failure category**: PROMPT
**Failed assertions**:
  - ...

---

## Feedback

### Prompt Refinement Suggestions
...

### Test Refinement Suggestions
...
```

## Tips

- Stack traces in `reason` fields are from PromptFoo internals — truncate after the first 3 lines for readability
- `llm-rubric` failures are almost always PROMPT failures unless the rubric itself is contradictory or impossible
- `javascript` failures that reference `meta.scratchpad`, `meta.toolsUsed`, or similar custom metadata fields should be checked: if the metadata embed is missing entirely, that's a HARNESS issue upstream of the assertion
- A test that has partial score (e.g., 0.67 with 2/3 assertions passing) is still a FAIL — report all failed component results
- Check `latencyMs` — extreme outliers (e.g., >120s) may indicate timeout-related harness issues rather than prompt quality
