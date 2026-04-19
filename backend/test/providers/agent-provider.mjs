import crypto from 'node:crypto';

/**
 * 
 * @param {string} path 
 * @param {RequestInit} init 
 * @returns 
 */
function fetchObsidian(path, init) {
  if (!process.env.OBSIDIAN_API_KEY) {
    console.warn('[agent-provider] OBSIDIAN_API_KEY not set');
  }

  init.headers = init.headers
    ? { ...init.headers, 'Authorization': `Bearer ${process.env.OBSIDIAN_API_KEY}` } 
    : { 'Authorization': `Bearer ${process.env.OBSIDIAN_API_KEY}` };

  return fetch(
    `http://localhost:27123/${path}`,
    init
  )
}

/**
 * PromptFoo custom provider for live agent evaluation.
 *
 * Calls the running backend's /api/v1/chat endpoint with a specific agentId,
 * consumes the chunked stream, and returns the final ChatMessage as output along
 * with tool usage metadata for use in assertions.
 *
 * Required vars (set in your promptfoo config):
 *   - agentId  {number}  The database agent_id of the agent to test
 *   - baseUrl  {string}  Backend base URL (default: http://localhost:3000)
 *
 * Returned value:
 *   output   — the agent's final text response (copyContent, no tool/thinking fences)
 *   metadata — { toolsUsed: string[], stats: object, threadId: string,
 *               scratchpad: string|null, allTurns: TurnResult[] }
 *
 * Usage in assertions:
 *   type: javascript
 *   value: "context.metadata.toolsUsed.includes('some_tool')"
 *
 * Scratchpad assertions (multi-turn):
 *   type: javascript
 *   value: |
 *     const meta = JSON.parse((output.match(/<!--EVAL_METADATA=(.*?)-->/) ?? ['','{}'])[1]);
 *     if (!meta.scratchpad?.includes('expected fact')) throw new Error('not in scratchpad');
 *     return true;
 */
export default class AgentProvider {
  constructor(options) {
    this.options = options ?? {};
    // Tracks { baseUrl, threadId } for every thread created during this eval run
    this._createdThreads = [];
  }

  id() {
    return 'live-agent';
  }

  async setup() {
    const file = this.options.config.file;
    const fileContents = this.options.config.content ?? '# Execute command via SSH \n\n The \`ssh\` command can be used to execute commands on a remote server.'

    if (file) {
      await fetchObsidian(
        `vault/${file}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown', 'accept': 'text/markdown', 'Apply-If-Content-Preexists': false },
          body: fileContents,
        }
      ).catch(() => {
        console.warn(`[agent-provider] Setup: Failed to delete existing file ${file} (this may be expected if it doesn't exist)`);
      });
    }
  }

  /**
   * Called by PromptFoo after all test cases have been evaluated.
   * Deletes every thread that was created during this eval run so the
   * backend doesn't accumulate stale eval threads.
   */
  async cleanup() {
    if (this._createdThreads.length === 0) return;

    console.log(`[agent-provider] Cleaning up ${this._createdThreads.length} eval thread(s)…`);

    const results = await Promise.allSettled(
      this._createdThreads.map(({ baseUrl, threadId }) =>
        fetch(`${baseUrl}/api/v1/chat/threads/${threadId}`, { method: 'DELETE' })
          .then((res) => {
            if (!res.ok) {
              console.warn(`[agent-provider] Failed to delete thread ${threadId}: HTTP ${res.status}`);
            }
          })
      ),
    );

    if (this.options.config?.file) {
      // Also delete the setup file if it was created
      const setupFile = this.options.config.file;

      await fetchObsidian(`vault/${setupFile}`, { method: 'DELETE' }).catch((err) => {
        console.warn(`[agent-provider] Failed to delete setup file ${setupFile}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[agent-provider] ${failed} thread deletion(s) failed`);
    } else {
      console.log('[agent-provider] All eval threads deleted successfully');
    }

    this._createdThreads = [];
  }

  async callApi(prompt, context) {
    // Run setup
    try {
      await this.setup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: `<!--EVAL_METADATA=${JSON.stringify({ toolsUsed: [], stats: {}, threadId: null, error: message })}-->`,
        metadata: { toolsUsed: [], stats: {}, threadId: null, error: message },
      };
    }

    try {
      return await this._callApiInner(prompt, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[agent-provider] Unexpected error: ${message}`);
      return {
        output: `<!--EVAL_METADATA=${JSON.stringify({ toolsUsed: [], stats: {}, threadId: null, error: message })}-->`,
        metadata: { toolsUsed: [], stats: {}, threadId: null, error: message },
      };
    }
  }

  /**
   * Consumes a chunked streaming response from /api/v1/chat and returns the
   * final done: payload parsed as an object.
   *
   * @param {Response} response
   * @returns {Promise<object>}
   */
  async _readStream(response) {
    if (!response.body) {
      throw new Error('[agent-provider] No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let finalMessage = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('done: ')) {
          try {
            finalMessage = JSON.parse(line.slice(6));
          } catch (e) {
            throw new Error(`[agent-provider] Failed to parse done payload: ${e.message}`);
          }
        }
      }
    }

    if (buffer.startsWith('done: ')) {
      try {
        finalMessage = JSON.parse(buffer.slice(6));
      } catch (e) {
        throw new Error(`[agent-provider] Failed to parse done payload: ${e.message}`);
      }
    }

    if (!finalMessage) {
      throw new Error('[agent-provider] Stream ended without a done: payload');
    }

    return finalMessage;
  }

  /**
   * Fetches the current scratchpad state for a thread.
   * Returns the scratchpad string, or null if none exists yet.
   *
   * @param {string} baseUrl
   * @param {string} threadId
   * @returns {Promise<string | null>}
   */
  async _fetchScratchpad(baseUrl, threadId) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/chat/${threadId}/scratchpad`);
      if (!res.ok) return null;
      const body = await res.json();
      const sp = body.scratchpad;
      // Endpoint returns a sentinel string when no scratchpad exists yet
      if (!sp || sp === 'No Scratchpad Found for Thread') return null;
      return sp;
    } catch {
      return null;
    }
  }

  /**
   * Sends a single turn to /api/v1/chat on an existing thread and returns the
   * turn result, including the scratchpad state after the turn completes.
   *
   * @param {string} baseUrl
   * @param {string} threadId
   * @param {number} agentId
   * @param {string} message
   * @returns {Promise<{ copyContent: string, toolsUsed: string[], stats: object, scratchpad: string | null }>}
   */
  async _sendTurn(baseUrl, threadId, agentId, message) {
    const response = await fetch(`${baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, threadId, agentId: Number(agentId) }),
    });

    if (!response.ok) {
      throw new Error(`[agent-provider] HTTP ${response.status}: ${await response.text()}`);
    }

    const finalMessage = await this._readStream(response);

    if (finalMessage.kind === 'error') {
      throw new Error(`[agent-provider] Agent returned error: ${finalMessage.message}`);
    }

    const scratchpad = await this._fetchScratchpad(baseUrl, threadId);

    return {
      copyContent: finalMessage.metadata?.copyContent ?? finalMessage.content ?? '',
      toolsUsed: finalMessage.metadata?.toolsUsed ?? [],
      stats: finalMessage.stats ?? {},
      scratchpad,
    };
  }

  async _callApiInner(prompt, context) {
    const agentId = context?.vars?.agentId;
    const baseUrl = context?.vars?.baseUrl ?? 'http://localhost:3000';

    if (agentId == null) {
      throw new Error('[agent-provider] agentId var is required');
    }

    // Multi-turn: use context.vars.messages if present.
    // Accepts either a JSON string (to avoid promptfoo array expansion) or a native array.
    // Falls back to the rendered prompt for single-turn tests.
    const rawMessages = context?.vars?.messages;
    let turns;
    if (Array.isArray(rawMessages)) {
      turns = rawMessages;
    } else if (typeof rawMessages === 'string') {
      try {
        turns = JSON.parse(rawMessages);
      } catch {
        turns = [rawMessages];
      }
    } else {
      turns = [prompt];
    }

    const turnDelayMs = this.options.config?.turnDelayMs ?? 500;

    // Create a real thread via the API so ThreadMetadata exists for the scratchpad endpoint
    const newThreadRes = await fetch(`${baseUrl}/api/v1/chat/new-thread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: Number(agentId), type: 'chat' }),
    });
    if (!newThreadRes.ok) {
      throw new Error(`[agent-provider] Failed to create thread: HTTP ${newThreadRes.status}`);
    }
    const { thread_id: threadId } = await newThreadRes.json();
    this._createdThreads.push({ baseUrl, threadId });

    const allTurns = [];

    for (let i = 0; i < turns.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, turnDelayMs));
      }

      let result;
      try {
        result = await this._sendTurn(baseUrl, threadId, agentId, turns[i]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[agent-provider] Turn ${i} failed: ${message}`);
        const errorMeta = { toolsUsed: [], stats: {}, threadId, allTurns, error: `Turn ${i} failed: ${message}` };
        return {
          output: `<!--EVAL_METADATA=${JSON.stringify(errorMeta)}-->`,
          metadata: errorMeta,
        };
      }
      allTurns.push({ message: turns[i], ...result });
    }

    const lastTurn = allTurns[allTurns.length - 1];

    const metadata = {
      toolsUsed: lastTurn.toolsUsed,
      stats: lastTurn.stats,
      // Final scratchpad state — use in assertions to verify what was captured,
      // e.g. meta.scratchpad?.includes('Lighthouse')
      scratchpad: lastTurn.scratchpad,
      threadId,
      allTurns,
    };

    // Embed metadata as an HTML comment at the end of the output.
    // This lets JS assertions parse it from `output` (the only reliable assertion input in
    // promptfoo 0.121.4 — context.response and context.metadata are not populated).
    // HTML comment format is ignored / minimally affects llm-rubric judges.
    const outputWithMeta = `${lastTurn.copyContent}\n<!--EVAL_METADATA=${JSON.stringify(metadata)}-->`;

    return {
      output: outputWithMeta,
      metadata,
    };
  }
}
