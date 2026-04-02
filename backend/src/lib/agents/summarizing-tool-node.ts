import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createMiddleware } from 'langchain';
import { Command } from '@langchain/langgraph';
import { Logger } from 'winston';

interface Artifact {
  text: string;
}

/**
 * Generates a human-friendly summary of a tool result using the provided LLM.
 * Falls back to a deterministic summary if the LLM call fails.
 */
export async function generateToolSummary(msg: ToolMessage, llm: BaseChatModel): Promise<string> {
  try {
    const prompt = `You called the tool "${msg.name}". Here is the result:\n\n${msg.content}\n\nSummarize this tool result in one concise sentence suitable for display in a chat UI. Be specific about what was returned. Do not include any preamble, just the summary sentence.`;
    
    const response = await llm.invoke([new HumanMessage(prompt)]);
    
    const text = typeof response.content === 'string'
      ? response.content.trim()
      : String(response.content).trim();
    
      return text || deterministicSummary(msg);
  } catch {
    return deterministicSummary(msg);
  }
}

/**
 * Deterministic fallback summary derived by parsing the tool message content.
 */
function deterministicSummary(msg: ToolMessage): string {
  const contentStr = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content);

  try {
    const parsed = JSON.parse(contentStr);
    if (Array.isArray(parsed)) {
      return `Called ${msg.name} → returned ${parsed.length} item${parsed.length !== 1 ? 's' : ''}`;
    }
    const readableKeys = ['title', 'name', 'message', 'success'];
    const found = readableKeys.map(k => parsed[k]).find(v => v !== undefined && v !== null);
    if (found !== undefined) {
      return `Called ${msg.name} → ${found}`;
    }
    return `Called ${msg.name}`;
  } catch {
    return `Called ${msg.name ?? 'unknown tool'}`;
  }
}

/**
 * Creates a copy of a ToolMessage with tool_summary added to additional_kwargs.
 */
function withSummary(msg: ToolMessage, summary: string): ToolMessage {
  // Combine any artifacts into the content so we can show that in the UI
  const artifactText = msg.artifact && msg.artifact.length > 0
    ? msg.artifact.map((a: Artifact) =>
        a.text
      ).join('\n\n')
    : '';

  return new ToolMessage({
    content: [artifactText, msg.content].filter(Boolean).join('\n\n'),
    tool_call_id: msg.tool_call_id,
    name: msg.name,
    id: msg.id,
    status: msg.status,
    additional_kwargs: { ...msg.additional_kwargs, artifact: msg.artifact, tool_summary: summary },
    response_metadata: msg.response_metadata,
  });
}

/**
 * Returns a LangChain agent middleware that enriches each ToolMessage result
 * with a `tool_summary` string in `additional_kwargs`. The summary is generated
 * by the provided LLM; falls back to a deterministic string on failure.
 */
export function createSummarizingMiddleware(llm: BaseChatModel, logger: Logger) {
  return createMiddleware({
    name: 'summarizing-tool-call',
    wrapToolCall: async (request, handler) => {
      logger.info('Summarizing Tool Call', { toolName: request.toolCall.name, args: request.toolCall.args });

      const result = await handler(request);
      if (result instanceof Command) {
        
        logger.info('Tool call returned a Command, skipping summarization');
        
        debugger;

        return result;
      }
      const summary = await generateToolSummary(result, llm);

      const toolWithSummary = withSummary(result, summary);

      logger.debug('Generated tool summary', { toolName: request.toolCall.name, summary });
      logger.info('Finished summarizing tool call', { toolName: request.toolCall.name });
      return toolWithSummary;
    },
  });
}
