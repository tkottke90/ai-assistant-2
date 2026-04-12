import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, ToolMessage, UsageMetadata } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { Logger } from "winston";
import z from "zod";

const LOG_PREFIX = (name: string = 'Agent') => `AgentRuntime.${name}.ToolSummary.`;

export interface CustomUsageMetadata extends UsageMetadata {
  tokens_per_second?: number;
  duration_ms?: number;

  context_window_tokens?: number;
  context_window_limit?: number;
  context_utilization_pct?: number;
}

export function createUsageMiddleware(
  model: BaseChatModel,
  name: string,
  middlewareLogger: Logger
) {
  return createMiddleware({
    name: 'usage-middleware',
    stateSchema: z.object({
      // Optionally track cumulative metrics in middleware state
      totalOutputTokens: z.number().default(0),
      totalDurationMs: z.number().default(0),
      // This is your context window consumption metric
      lastContextWindowTokens: z.number().default(0),
    }),
    
    wrapModelCall: async (request, handler) => {
      const logger = middlewareLogger.child({ location: LOG_PREFIX(name) + '.usageMiddleware' });

      const startTime = performance.now();

      // Call the model
      const response = await handler(request);

      const durationMs = performance.now() - startTime;
      const durationSec = durationMs / 1000;

      const outputTokens = response.usage_metadata?.output_tokens ?? 0;
      const tokensPerSec = durationSec > 0 ?  Math.round((outputTokens / (durationMs / 1000)) * 100) / 100 : 0;

      const context_window_tokens = response.usage_metadata?.input_tokens ?? 0;
      const inputTokens = response.usage_metadata?.input_tokens ?? 0;
      const context_window_limit = model.profile.maxInputTokens;

      response.response_metadata.performance = {
        output_tokens: outputTokens,
        duration_ms: Math.round(durationMs),
        context_window_tokens: context_window_tokens,
      }

      // Store the metric directly in the message's response_metadata
      response.usage_metadata = {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: outputTokens,

        ...response.usage_metadata,

        tokens_per_second: tokensPerSec,
        duration_ms: Math.round(durationMs),
        context_window_tokens,
        context_window_limit,
        context_utilization_pct: context_window_limit
          ? Math.round((inputTokens / context_window_limit) * 10000) / 100
          : undefined,
      } as any;

      return response;
    },
    // Use afterModel to update the cumulative state metrics
    afterModel: (state) => {
      const lastMessage = state.messages.at(-1);
      const perf = lastMessage?.response_metadata?.performance;
      if (!perf) return;

      return {
        totalOutputTokens: state.totalOutputTokens + (perf.output_tokens ?? 0),
        totalDurationMs: state.totalDurationMs + (perf.duration_ms ?? 0),
        lastContextWindowTokens: state.lastContextWindowTokens + (perf.context_window_tokens ?? 0),
      };
    },
  });
}