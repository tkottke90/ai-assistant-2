import { CustomUsageMetadata } from "@/lib/agents/middleware/usage";
import { InteractionSchema } from "@/lib/models/chat";
import StringUtils from "@/lib/utils/string.utils";
import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from "langchain";
import _ from 'lodash';
import crypto from 'node:crypto';

type ChatDataModes = 'responding' | 'thinking' | 'tool';

interface ChatDataChunk {
  mode: ChatDataModes;
  id: string;
  content: string;
  args?: string;
  response?: string;
}

interface ChatUsageData {
  toolsUsed: string[];
  toolFailures: number;
}

export class ChatData {
  private chatUUID = crypto.randomUUID();
  private chunks: Map<string, ChatDataChunk> = new Map();
  private currentChunk: string = '';
  private seenChunks = new Set<string>();
  private historicalChunks = new Set<string>();
  private chunkOrder: string[] = [];
  private usage: ChatUsageData = {
    toolsUsed: [],
    toolFailures: 0,
  };

  private modelCallUsage: Map<string, CustomUsageMetadata> = new Map();

  tmpUsage: any[] = [];

  get activeChunk() {
    return this.chunks.get(this.currentChunk);
  }

  addChunkId(id: string, includeInOrder: boolean = true) {
    if (!this.seenChunks.has(id)) {
      this.seenChunks.add(id);

      if (includeInOrder) this.chunkOrder.push(id)
    }
  }

  addHistoricalChunkId(id: string) {
    if (!this.historicalChunks.has(id)) {
      this.historicalChunks.add(id);
    }
  }

  classifyChunk(message: HumanMessage | AIMessage | ToolMessage | AIMessageChunk) {
    if (message instanceof HumanMessage) {
      return 'human';
    }

    if (message instanceof ToolMessage) {
      return 'tool_response';
    }

    if (message instanceof AIMessage) {
      return 'ai';
    }

    // Messages Below are all AIMessageChunks

    // Tool calls are recorded in the `tool_calls` property of a message
    const hasToolCall = _.has(message as AIMessageChunk, 'tool_calls') && message.tool_calls?.length;

    // Content chunks are when the agent is responding
    const hasContent = message.type === 'ai' && !!message.content;

    // Thinking chunks are when the agent is reasoning, they can be found in either `additional_kwargs.reasoning_content`
    // or `response_metadata.reasoning_content` depending on the version of langchain and agent used
    const hasThinking = message.type === 'ai' && (
      _.has(message, 'additional_kwargs.reasoning_content') ||
      _.has(message, 'response_metadata.reasoning_content')
    );

    // If it is missing all of these, it's likely an empty chunk sent at the beginning of a message stream, so we can ignore it
    if (!hasToolCall && !hasContent && !hasThinking) {
      return '';
    }

    if (hasToolCall) {
      return 'tool_call';
    }

    if (hasThinking) {
      return 'thinking';
    }

    return 'responding';
  }

  getThinkingContent(message: any) {
    return _.get(message, 'additional_kwargs.reasoning_content') || _.get(message, 'response_metadata.reasoning_content') || '';
  }

  getChunkId(message: any, streamMode: string, chunkType: string) {
    switch(chunkType) {
      case 'thinking': {
        const thinkingSuffix = streamMode == 'messages' && chunkType === 'thinking'
          ? `-thinking-${Date.now()}`
          : '';

        return message.id + thinkingSuffix;
      }

      case 'tool_call':
        return message.tool_calls?.[0]?.id; // assume 1 tool call per chunk for now

      case 'tool_response':
        return message.tool_call_id;

      default:
        return message.id;
    }
  }

  nextChunk(message: any, streamMode: string) {
    if (this.skipChunk(message)) return;

    // Only process chunks once
    const chunkType = this.classifyChunk(message);
    
    // If a human message OR a empty string,we should ignore it
    if (chunkType === '' || chunkType === 'human') {
      return;
    };

    // If we are reviewing a `value` we should ignore thinking
    // chunks since they are already processed by the `messages
    if (streamMode === 'values' && chunkType === 'thinking') {
      return;
    }

    // Check if current chunk and incoming chunk are the same type,
    // if not, we finalize the current chunk and start a new one
    const currentChunk = this.chunks.get(this.currentChunk);

    // If we switch modes, update the current chunk id
    if (currentChunk?.mode !== chunkType) {
      
      // When the agent is thinking, it emits a stream of content chunks as messages
      // that we want to listen for.  
      const thinkingSuffix = streamMode == 'messages' && chunkType === 'thinking'
        ? `-thinking-${Date.now()}`
        : '';

      this.currentChunk = message.id + thinkingSuffix;
    }

    // Update any of our usage metrics when we see them
    if ('usage_metadata' in message && message.usage_metadata) {
      const msgId = message.id ?? message.tool_call_id;

      if (msgId && !this.modelCallUsage.has(msgId)) {
        this.modelCallUsage.set(msgId, message.usage_metadata as CustomUsageMetadata);
      }
    }

    switch(chunkType) {
      case 'ai': 
        debugger;

        break;

      // Capture the agent's reasoning comments in a special "thinking"
      // chunk so that we can render them differently in the UI using
      // code blocks
      case 'thinking': {
        this.addChunkId(this.currentChunk);
        const existingContent = this.chunks.get(this.currentChunk)?.response || '';
        
        const newThinkingContent = this.getThinkingContent(message);

        // If incoming content is >= existing length, it's a values-mode replay — replace, don't append
        const response = streamMode === 'values'
          ? newThinkingContent
          : existingContent + newThinkingContent;

        this.chunks.set(this.currentChunk, {
          mode: chunkType as ChatDataModes,
          id: this.currentChunk,
          content: StringUtils.multilineString([
            StringUtils.codeBlockFence('thinking'),
            response,
            StringUtils.codeBlockFence(),
          ]),
          response,
        });

        break;
      }

      // Responding chunks are the main content the agent wishes to communicate
      // with.  We capture those so we can render them.
      case 'responding': {
        this.addChunkId(this.currentChunk);
        const existingContent = this.chunks.get(this.currentChunk)?.content || '';
        
        // If incoming content is >= existing length, it's a values-mode replay — replace, don't append
        const content = streamMode === 'values'
          ? String(message.content)
          : existingContent + String(message.content);

        this.chunks.set(this.currentChunk, {
          mode: chunkType as ChatDataModes,
          id: this.currentChunk,
          content: content,
        });

        break;
      }

      // Tool calls allow us to display that an Agent has decided to call
      // a tool with a specific set of arguments.  This allows us to show
      // that in the UI as a pending tool call.
      case 'tool_call': {
        (message as AIMessageChunk).tool_calls?.forEach(toolCall => {
          // Skip tool calls without an id - no way to track them 
          if (!toolCall.id) return;
          
          this.addChunkId(toolCall.id);

          const existingChunk = this.chunks.get(toolCall.id);

          const args = existingChunk?.args
            ? existingChunk.args + toolCall.args
            : toolCall.args;

          this.chunks.set(toolCall.id, {
            mode: 'tool',
            id: toolCall.id,
            content: StringUtils.multilineString([
              StringUtils.codeBlockFence('calling-tool'),
              toolCall.name || 'unknown-tool',
              StringUtils.codeBlockFence(),
            ]),
            args: args ? JSON.stringify(args) : undefined,
            response: ''
          })
        });


        break;
      }

      // When a tool call completes, a Tool Message is emitted
      // by the graph.  This should close a `tool_call` chunk and
      // finalize the output.  This allows us to capture the tool
      // response and display it in the UI.
      case 'tool_response': {
        if (!message.tool_call_id) return;

        this.addChunkId(message.tool_call_id);
        const existingChunk = this.chunks.get(message.tool_call_id);

        const toolDetails = {
          tool: (message as ToolMessage).name,
          args: this.tryParseJSON(existingChunk?.args || '{}'),
          response: this.tryParseJSON(message.content || '{}'),
        }

        const content = [
          StringUtils.codeBlockFence('tool-result'),
          JSON.stringify(toolDetails, null, 2),
          StringUtils.codeBlockFence(),
        ].join('\n');

        this.chunks.set(message.tool_call_id, {
          mode: 'tool',
          id: message.tool_call_id,
          content
        });

        // Only capture named tool calls
        if (message.name) {
          this.usage.toolsUsed.push(message.name);
          this.usage.toolFailures += (message as ToolMessage).status === 'error' ? 1 : 0;
        }

        break;
      }
    }

    return this.chunks.get(this.currentChunk);
  }

  skipChunk(message: any) {
    // Skip all historical chunks
    if (message.id && this.historicalChunks.has(message.id)) {
      return true;
    }

    if (message.tool_call_id && this.historicalChunks.has(message.tool_call_id)) {
      return true;
    }

    return false;
  }

  toChatMessage(name?: string) {
    const sortedChunks = this.chunkOrder.map(id => this.chunks.get(id)).filter(Boolean) as ChatDataChunk[];
    const content = sortedChunks.map(chunk => chunk.content).join('\n\n');

    // Create a chunk containing only the response, this is the text that would be copied
    // when the user clicks "copy response" in the UI, it should not include the agent's internal thinking or tool calls
    const copyContent = sortedChunks.filter(chunk => chunk.mode === 'responding').map(chunk => chunk.content).join('\n\n');

    // Aggregate across unique model calls
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;
    let cacheReadTokens = 0;
    let lastUsage: CustomUsageMetadata | undefined;

    for (const usage of this.modelCallUsage.values()) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      totalTokens += usage.total_tokens ?? 0;
      totalDurationMs += usage.duration_ms ?? 0;
      cacheReadTokens += (usage as any).input_token_details?.cache_read ?? 0;
      lastUsage = usage; // last call = final context state
    }

    return InteractionSchema.parse({
      id: this.chatUUID,
      type: 'chat_message',
      role: 'ai',
      content,
      created_at: new Date().toISOString(),
      name,
      metadata: {
        copyContent,
        toolsUsed: this.usage.toolsUsed,
      },
      usage: {
        prompt: inputTokens,              // 3. total input tokens (cost)
        completion: outputTokens,          // 4. total output tokens (cost)
        total: totalTokens,
        cache_read: cacheReadTokens,       // for cost split: cached portion at discount rate
      },
      stats: {
        contextWindowTokens: lastUsage?.context_window_tokens ?? 0,        // 1. context window size
        contextWindowLimit: lastUsage?.context_window_limit,                // 2. context window utilization (numerator/denominator)
        contextUtilizationPct: lastUsage?.context_utilization_pct ?? 0,    // 2. pre-computed percentage

        tokensPerSecond: totalDurationMs > 0                               // 5. output tok/s
          ? Math.round((outputTokens / (totalDurationMs / 1000)) * 100) / 100
          : 0,

        toolsUsed: this.usage.toolsUsed.length,
        toolFailures: this.usage.toolFailures,
      }
    });
  }

  tryParseJSON(content: string): string {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
}

