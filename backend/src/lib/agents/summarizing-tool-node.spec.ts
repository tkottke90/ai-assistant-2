import { expect } from 'chai';
import { ToolMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { generateToolSummary, createSummarizingMiddleware } from './summarizing-tool-node.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(content: string, name: string): ToolMessage {
  return new ToolMessage({ content, tool_call_id: 'tc-1', name });
}

/** LLM mock that resolves with the given string content. */
function mockLLM(content: unknown) {
  return { invoke: async () => ({ content }) } as any;
}

/** LLM mock that always throws. Used to exercise the deterministic fallback. */
const throwingLLM = { invoke: async () => { throw new Error('LLM unavailable'); } } as any;

/** Helper: exercise deterministicSummary via generateToolSummary with a failing LLM. */
function fallback(content: string, name: string): Promise<string> {
  return generateToolSummary(makeMsg(content, name), throwingLLM);
}

// ---------------------------------------------------------------------------
// generateToolSummary — LLM path
// ---------------------------------------------------------------------------

describe('generateToolSummary', () => {
  describe('LLM path', () => {
    it('should return the trimmed string response from the LLM', async () => {
      const result = await generateToolSummary(makeMsg('{}', 'my_tool'), mockLLM('  Tool returned a result.  '));
      expect(result).to.equal('Tool returned a result.');
    });

    it('should coerce non-string LLM content to a string and trim it', async () => {
      const result = await generateToolSummary(makeMsg('{}', 'my_tool'), mockLLM(42));
      expect(result).to.equal('42');
    });

    it('should fall back to deterministicSummary when LLM returns empty string', async () => {
      const result = await generateToolSummary(makeMsg('[1,2,3]', 'my_tool'), mockLLM(''));
      expect(result).to.equal('Called my_tool → returned 3 items');
    });

    it('should fall back to deterministicSummary when LLM invoke throws', async () => {
      const result = await generateToolSummary(makeMsg('[1]', 'my_tool'), throwingLLM);
      expect(result).to.equal('Called my_tool → returned 1 item');
    });
  });

  // -------------------------------------------------------------------------
  // deterministicSummary — exercised via generateToolSummary + throwingLLM
  // -------------------------------------------------------------------------

  describe('deterministicSummary fallback', () => {
    describe('array content', () => {
      it('should use plural "items" for arrays with 0 elements', async () => {
        expect(await fallback('[]', 'tool_a')).to.equal('Called tool_a → returned 0 items');
      });

      it('should use singular "item" for an array with exactly 1 element', async () => {
        expect(await fallback('[1]', 'tool_a')).to.equal('Called tool_a → returned 1 item');
      });

      it('should use plural "items" for arrays with more than 1 element', async () => {
        expect(await fallback('[1,2,3]', 'tool_a')).to.equal('Called tool_a → returned 3 items');
      });
    });

    describe('object content — readable key priority', () => {
      it('should prefer the "title" key', async () => {
        expect(await fallback('{"title":"My Page","name":"ignored"}', 'tool_b')).to.equal('Called tool_b → My Page');
      });

      it('should fall back to "name" when "title" is absent', async () => {
        expect(await fallback('{"name":"Alice"}', 'tool_b')).to.equal('Called tool_b → Alice');
      });

      it('should fall back to "message" when "title" and "name" are absent', async () => {
        expect(await fallback('{"message":"ok"}', 'tool_b')).to.equal('Called tool_b → ok');
      });

      it('should fall back to "success" when earlier keys are absent', async () => {
        expect(await fallback('{"success":true}', 'tool_b')).to.equal('Called tool_b → true');
      });

      it('should skip keys whose values are null', async () => {
        expect(await fallback('{"title":null,"name":null,"message":null,"success":null}', 'tool_c')).to.equal('Called tool_c');
      });

      it('should return bare "Called {name}" for an object with no readable keys', async () => {
        expect(await fallback('{"foo":"bar","baz":1}', 'tool_c')).to.equal('Called tool_c');
      });
    });

    describe('edge cases', () => {
      it('should return bare "Called {name}" for non-JSON string content', async () => {
        expect(await fallback('not valid json', 'tool_d')).to.equal('Called tool_d');
      });

      it('should return "Called unknown tool" when msg.name is undefined', async () => {
        // ToolMessage without a name — name defaults to undefined
        const msg = new ToolMessage({ content: 'not json', tool_call_id: 'tc-1' });
        const result = await generateToolSummary(msg, throwingLLM);
        expect(result).to.equal('Called unknown tool');
      });

      it('should JSON.stringify non-string content before parsing', async () => {
        // Content is a LangChain multimodal content block array (non-string)
        const msg = new ToolMessage({
          content: [{ type: 'text', text: 'hello' }] as any,
          tool_call_id: 'tc-1',
          name: 'tool_e',
        });
        // JSON.stringify of the 1-element array → parsed as array → "1 item"
        const result = await generateToolSummary(msg, throwingLLM);
        expect(result).to.equal('Called tool_e → returned 1 item');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// createSummarizingMiddleware
// ---------------------------------------------------------------------------

describe('createSummarizingMiddleware', () => {
  it('should return a middleware object with the expected name', () => {
    const middleware = createSummarizingMiddleware(mockLLM('summary')) as any;
    expect(middleware.name).to.equal('summarizing-tool-call');
  });

  it('should expose a wrapToolCall function', () => {
    const middleware = createSummarizingMiddleware(mockLLM('summary')) as any;
    expect(middleware.wrapToolCall).to.be.a('function');
  });

  it('should pass through Command results unchanged without calling the LLM', async () => {
    let llmCalled = false;
    const llm = { invoke: async () => { llmCalled = true; return { content: 'summary' }; } } as any;
    const middleware = createSummarizingMiddleware(llm) as any;
    const cmd = new Command({ update: {} });
    const result = await middleware.wrapToolCall({} as any, async () => cmd);
    expect(result).to.equal(cmd);
    expect(llmCalled).to.be.false;
  });

  it('should enrich a ToolMessage with tool_summary in additional_kwargs', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Retrieved 2 memories.')) as any;
    const msg = makeMsg('[1,2]', 'my_tool');
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.additional_kwargs.tool_summary).to.equal('Retrieved 2 memories.');
  });

  it('should set content to only the summary when artifact is absent', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Summary text.')) as any;
    const msg = makeMsg('{}', 'my_tool');
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.content).to.equal('Summary text.');
  });

  it('should prepend artifact text to content when artifact is present', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Summary text.')) as any;
    const msg = new ToolMessage({
      content: '{}',
      tool_call_id: 'tc-1',
      name: 'my_tool',
      artifact: [{ text: 'Artifact line one' }, { text: 'Artifact line two' }],
    });
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    const content = result.content as string;
    expect(content).to.include('Artifact line one');
    expect(content).to.include('Artifact line two');
    expect(content).to.include('Summary text.');
    expect(content.indexOf('Artifact line one')).to.be.lessThan(content.indexOf('Summary text.'));
  });

  it('should store artifact on additional_kwargs of the enriched message', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Summary.')) as any;
    const artifacts = [{ text: 'some artifact' }];
    const msg = new ToolMessage({ content: '{}', tool_call_id: 'tc-1', name: 'my_tool', artifact: artifacts });
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.additional_kwargs.artifact).to.deep.equal(artifacts);
  });

  it('should preserve identity fields (tool_call_id, name, id, status) on the enriched message', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Summary.')) as any;
    const msg = new ToolMessage({
      content: '{}',
      tool_call_id: 'tc-42',
      name: 'preserve_me',
      id: 'msg-id-99',
      status: 'success',
    });
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.tool_call_id).to.equal('tc-42');
    expect(result.name).to.equal('preserve_me');
    expect(result.id).to.equal('msg-id-99');
    expect(result.status).to.equal('success');
  });

  it('should use the fallback summary when the LLM fails', async () => {
    const middleware = createSummarizingMiddleware(throwingLLM) as any;
    const msg = makeMsg('[1,2,3]', 'my_tool');
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.additional_kwargs.tool_summary).to.equal('Called my_tool → returned 3 items');
  });

  it('should preserve existing additional_kwargs on the enriched message', async () => {
    const middleware = createSummarizingMiddleware(mockLLM('Summary.')) as any;
    const msg = new ToolMessage({
      content: '{}',
      tool_call_id: 'tc-1',
      name: 'my_tool',
      additional_kwargs: { custom_field: 'original_value' },
    });
    const result = (await middleware.wrapToolCall({} as any, async () => msg)) as ToolMessage;
    expect(result.additional_kwargs.custom_field).to.equal('original_value');
    expect(result.additional_kwargs.tool_summary).to.equal('Summary.');
  });
});
