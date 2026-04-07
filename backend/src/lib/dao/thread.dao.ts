import crypto from 'node:crypto';
import { BaseMessage } from 'langchain';

function generateThreadId(): string {
  return crypto.randomUUID();
}
function getMessageUsage(message: BaseMessage) {
  let usage = {
    prompt: 0,
    completion: 0,
    total: 0,
  };

  // Prefer the standard LangChain usage_metadata field (populated by all providers)
  const usageMeta = (message as any).usage_metadata as Record<string, any> | undefined;
  if (usageMeta) {
    return {
      prompt: usageMeta.input_tokens ?? 0,
      completion: usageMeta.output_tokens ?? 0,
      total: usageMeta.total_tokens ?? (usageMeta.input_tokens ?? 0) + (usageMeta.output_tokens ?? 0),
    };
  }

  // Fallback: Ollama-specific response_metadata fields
  const metadata = message.response_metadata as Record<string, any> | undefined;
  if (!metadata || !metadata.eval_count) return usage;

  return {
    prompt: metadata.prompt_eval_count ?? 0,
    completion: metadata.eval_count ?? 0,
    total: (metadata.prompt_eval_count ?? 0) + (metadata.eval_count ?? 0),
  };
}

function getGenerationDetails(message: BaseMessage) {
  const metadata = message.response_metadata as Record<string, any> | undefined;
  const usageMeta = (message as any).usage_metadata as Record<string, any> | undefined;

  // Token count: prefer usage_metadata, fall back to Ollama's eval_count
  const tokens = usageMeta?.output_tokens ?? metadata?.eval_count ?? 0;

  if (!tokens) return {};

  // Timing stats are Ollama-specific — not available from other providers
  const duration = ((metadata?.eval_duration ?? 0) / 1e9);
  const totalDuration = ((metadata?.total_duration ?? 0) / 1e9);
  const tokensPerSecond = duration > 0 ? tokens / duration : 0;

  return {
    model: metadata?.model,
    tokens,
    ...(duration > 0 && {
      generation_time_sec: Math.round(duration),
      total_time_sec: Math.round(totalDuration),
      tokens_per_second: Math.round(tokensPerSecond),
    }),
  };
}

export default {
  getMessageUsage,
  generateThreadId,
  getGenerationDetails,
}