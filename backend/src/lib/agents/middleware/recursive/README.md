# Recursive Scratchpad Middleware Design

Because memory is a premium for Local LLM Agents, we need to be smart about how information is managed so that agents can be effective.

## Challenge

One of the key challenges of LLM Agents is how to effectively manage the limited space available within the prompt.  When the max context window size is exceeded we run the risk of:

1. The agent forgetting important information due to recency bias
2. Engines like Ollama returning empty responses

This can lead to bad results, LLM confusion, and poor user experience.

## Inspiration — Recursive Language Models

This design is inspired by research on Recursive Language Models (RLMs) (Singh et al., 2025).  The key insight from that paper is that the context window should not simply be filled with raw conversation history — it should instead contain a curated set of information directly relevant to the task at hand.

> Recursive Language Models expose the same external interface as an LLM or a reasoning model: it accepts a string prompt of arbitrary structure and produces a string response. Given a prompt P, the RLM initializes a Read-Eval-Print Loop (REPL) programming environment in which P is set as the value of a variable. It then offers the LLM general context about the REPL environment (e.g., the length of the string P), and permits it to write code that peeks into and decomposes P, and to iteratively observe any side effects from execution. Crucially, RLMs encourage the LLM to understand, transform, and execute the input prompt by writing symbolic programs that invoke the LLM itself on as many slices of the input as necessary.
>
> We find that RLMs demonstrate extremely strong performance even at the 10M+ token scale, and substantially outperform all other approaches at long-context processing, in many cases by double-digit percentage gains while maintaining comparable cost.

The core principle we borrow: **treat the conversation history as external data too large to fit in context, and maintain a curated workspace that the system can navigate recursively — slicing into just the relevant parts as needed.**

We do not implement the full REPL-based recursion from the paper. The key difference is that in the paper the LLM itself triggers decomposition by writing programs. Here, the **middleware owns all decomposition and navigation** — the agent only ever sees flat, named sections and writes plain content to them. The recursive structure grows automatically in response to usage rather than being planned upfront by the LLM.

## Solution - Design

The middleware maintains a per-thread **scratchpad**: a structured working memory that grows with the conversation while staying navigable within the context window. On each turn, the middleware:

1. Navigates the scratchpad to find sections relevant to the current message and injects them into the model's context
2. Allows the agent to respond normally
3. After the response, reflects on the conversation and updates the scratchpad with new information or revised content
4. If any section has grown too large, automatically decomposes it into sub-sections

The LLM's interface is deliberately simple: it writes content into named sections. The middleware handles all size management, hierarchy, and navigation — the tree structure is an **emergent consequence of use**, not a pre-planned design by the LLM.

### Architecture

The scratchpad is implemented as a middleware that wraps around the agent's LLM calls.  This lets us inject context before each model call and run reflection after the agent has finished its turn, without the agent needing to reason about either.

```
Turn N:
  Agent
    -> Scratchpad Middleware (discovery: inject relevant sections)
      -> LLM Call(s)
    <- Scratchpad Middleware (reflection: update sections, decompose if needed)
```

The middleware runs on `wrapModelCall` (first call of the turn only — subsequent tool-reasoning calls within the same turn pass through unchanged) and `afterAgent` (once per turn for reflection).

### Scratchpad

The scratchpad is stored as part of the LangGraph **Checkpoint**, scoped to the conversation thread. This means it persists naturally across turns without any separate storage mechanism.

The scratchpad is stored as XML for several practical reasons:

- **Human-readable** — easy to inspect and debug without parsing
- **Attribute metadata** — section name and summary are attributes, keeping them separate from content
- **CDATA blocks** — large content (tool outputs, long notes) can be stored without escaping concerns
- **XML comments** — allow manual annotations when debugging or intervening directly

#### Data Structure

Each section has a `name`, a one-sentence `summary` (shown only in the table of contents for cheap navigation), and a `content` body.  Sections that have been decomposed also carry `children` — their own list of sections with the same shape.

```ts
interface Section {
  name: string;        // unique identifier among siblings
  summary: string;     // one sentence, shown in TOC for navigation
  content: string;     // full content (empty if section has been decomposed into children)
  children: Section[]; // populated by auto-decomposition; starts empty
}

interface Scratchpad {
  toc: Pick<Section, 'name' | 'summary'>[];  // flat list: names + summaries of top-level sections
  sections: Section[];
}
```

The scratchpad **starts flat**. All new sections are added at the top level. As sections grow, the middleware decomposes them into children automatically. The tree deepens through use — not through upfront planning.

```xml
<scratchpad>
  <toc>
    <entry name="research" summary="Notes and references related to the RLM paper" />
    <entry name="user-preferences" summary="Communication style and formatting preferences" />
  </toc>
  <section name="research" summary="Notes and references related to the RLM paper">
    <!-- content is empty because this section was decomposed -->
    <toc>
      <entry name="summary" summary="High-level summary of the paper's contribution" />
      <entry name="key-quotes" summary="Notable quotes to reference later" />
    </toc>
    <section name="summary" summary="High-level summary of the paper's contribution">
      <content><![CDATA[
        RLMs treat the input prompt as external data and decompose it recursively
        using a REPL, allowing LLMs to process inputs far exceeding their context window.
      ]]></content>
    </section>
    <section name="key-quotes" summary="Notable quotes to reference later">
      <content><![CDATA[
        "By treating the prompt itself as an external object and enabling symbolic
        recursion, RLMs tackle limitations of expressive power..."
      ]]></content>
    </section>
  </section>
  <section name="user-preferences" summary="Communication style and formatting preferences">
    <content><![CDATA[
      Prefers concise bullet-pointed responses. Dislikes excessive caveats.
      Uses TypeScript/Node.js stack.
    ]]></content>
  </section>
</scratchpad>
```

#### Auto-Decomposition

This is the core mechanism that makes the scratchpad scale rather than bloat.

**Rule:** When a section's content exceeds a token threshold, the middleware automatically decomposes it — invoking the LLM on just that section's content to produce 2-4 named sub-sections. The parent's content is replaced with a one-sentence summary and the detail moves into children. The same rule applies recursively: if a child later exceeds the threshold, it decomposes too.

```
Section "research" content grows past threshold
  -> middleware calls LLM: "split this into 2-4 sub-sections"
  -> LLM returns: [
      { name: "summary",    summary: "...", content: "..." },
      { name: "key-quotes", summary: "...", content: "..." }
    ]
  -> parent content becomes: "Research notes on the RLM paper"
  -> children hold the original detail
  -> if "key-quotes" later exceeds the threshold, same rule fires again
```

The decomposition LLM call is intentionally narrow: only the oversized section's content is in context, and the output schema is tightly structured. This makes it cheap and reliable relative to open-ended generation.

The recursive invariant is: **present a TOC, select entries, descend if needed — at any depth, for both reading and writing.** Both discovery and decomposition are the same operation applied at successive levels of the tree.

#### Discovery

Discovery runs in `wrapModelCall` on the first model call of each turn.

The middleware starts at the root TOC and asks the LLM (using the last few messages as context) which sections look relevant.  If a selected section has children, the middleware presents that section's child TOC and asks again. This continues up to a configurable max depth (default: 3 steps). The content of all reached leaf sections is then injected into the agent's context for the main model call.

```
Turn start: root TOC presented
  -> LLM selects "research"
  -> research has children: research child TOC presented
    -> LLM selects "key-quotes"
    -> key-quotes is a leaf: content injected into context
  -> LLM also selects "user-preferences"
  -> user-preferences is a leaf: content injected into context

Main model call receives:
  - system message with injected section content
  - recent conversation history (last N messages)
```

If the scratchpad is small enough to fit in context entirely, the full XML is injected and the navigation step is skipped.

```ts
wrapModelCall: async (request, handler) => {
  const MAX_NAV_DEPTH = 3;
  const RECENT_MESSAGES = -8;

  const scratchpad = loadScratchpad(state);

  // If small enough, inject the whole thing and skip navigation
  if (scratchpad.totalSize() <= FULL_INJECT_THRESHOLD) {
    return handler({
      ...request,
      systemMessage: request.systemMessage.concat(
        new SystemMessage(`Scratchpad:\n${scratchpad.toXML()}`)
      ),
      messages: request.messages.slice(RECENT_MESSAGES),
    });
  }

  // Otherwise, walk the tree to find relevant sections
  const selected = await navigateScratchpad(
    scratchpad,
    request.messages.slice(RECENT_MESSAGES),
    MAX_NAV_DEPTH
  );

  return handler({
    ...request,
    systemMessage: request.systemMessage.concat(
      new SystemMessage(`Relevant scratchpad notes:\n${selected.map(s => s.content).join('\n\n')}`)
    ),
    messages: request.messages.slice(RECENT_MESSAGES),
  });
}
```

#### Reflection

After the agent has finished its turn, the middleware reflects on the conversation and updates the scratchpad. The LLM is given the recent message history and the current list of top-level section names and summaries, and returns a list of update operations.

The LLM's interface intentionally stays **flat**: it writes to named sections by name only. It never needs to know about paths, hierarchy, or children. The tree structure is invisible to the reflection LLM — that complexity lives entirely in the middleware.

The available operations are:

| Operation | Description |
|---|---|
| `append` | Write content to a named section. If the section does not exist, create it. |
| `rewrite` | Replace a section's content entirely (used when the existing content is stale or poorly organized). |
| `remove` | Delete a section that is no longer relevant. |

> **Note:** Reflection is currently synchronous — the agent turn does not complete until reflection finishes. A future optimization is to run reflection as a fire-and-forget background job after the response has been sent to the client, but this introduces race conditions if the next turn starts before reflection completes and is deferred for now.

```ts
afterAgent: async (state) => {
  const scratchpad = loadScratchpad(state);

  // { callbacks: [] } intentionally suppresses these tokens from the client response stream
  const response = await llm.withStructuredOutput(ScratchpadUpdateSchema).invoke(
    [...state.messages.slice(-8), buildReflectionPrompt(scratchpad.topLevelSections())],
    { callbacks: [] }
  );

  for (const update of response.updates) {
    switch (update.type) {
      case 'append':  scratchpad.appendSection(update.section, update.content); break;
      case 'rewrite': scratchpad.rewriteSection(update.section, update.content); break;
      case 'remove':  scratchpad.removeSection(update.section); break;
    }
  }

  // Auto-decompose any sections that have exceeded the size threshold
  await scratchpad.decomposeOversizedSections(llm);

  return { scratchpad: scratchpad.toXML() };
}
```
