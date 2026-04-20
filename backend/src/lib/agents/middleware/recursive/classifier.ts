// ─── Types ────────────────────────────────────────────────────────────────────

export type IncrementSignalType =
  | "user-preference"
  | "user-stated-fact"
  | "tool-result"
  | "environment-state"
  | "working-note"
  | "discard-signal"
  | "no-content";

export interface ClassifiedSignal {
  type: IncrementSignalType;
  source: "user" | "tool" | "assistant";
  excerpt: string;
  requiresOperation: boolean;
}

// ─── Trigger Patterns ─────────────────────────────────────────────────────────

const PREFERENCE_TRIGGERS: RegExp[] = [
  /\bi\s+prefer\b/i,
  /\bi\s+like\b/i,
  /\bi\s+don['']t\s+like\b/i,
  /\bi\s+dislike\b/i,
  /\bcan\s+you\s+remember\s+that\b/i,
  /\bplease\s+make\s+a?\s*note\b/i,
  /\bplease\s+note\s+that\b/i,
  /\bkeep\s+it\b/i,
  /\bkeep\s+(?:answers|things|responses)\b/i,
  /\balways\s+respond\s+in\b/i,
  /\balways\s+use\b/i,
  /\bplease\s+always\b/i,
  /\bstop\s+\w+ing\b/i,
  /\bdon['']t\s+(?:use|add|ask|include|put|write|repeat|say|do)\b/i,
  /\bbe\s+(?:more\s+)?(?:concise|brief|short|formal|casual|direct|verbose)\b/i,
  /\brespond\s+in\b/i,
  /\buse\s+(?:bullet|markdown|headers|plain\s+text|code\s+blocks|numbered)\b/i,
  /\bskip\s+the\s+preamble\b/i,
  /\bno\s+preamble\b/i,
  /\bno\s+(?:more\s+)?(?:bullet|code\s+block|header|markdown)\b/i,
];

const FACT_TRIGGERS: RegExp[] = [
  /\bmy\s+\w+\s+is\s+called\b/i,
  /\bmy\s+(?:name|project|app|application|company|team|role|job)\s+is\b/i,
  /\bi(?:'m|\s+am)\s+working\s+on\b/i,
  /\bwe\s+use\b/i,
  /\bour\s+(?:stack|team|project|app|system|database|framework)\s+is\b/i,
  /\bthe\s+project\s+is\b/i,
  /\bi(?:'m|\s+am)\s+(?:a|an)\s+\w+/i,
  /\bmy\s+(?:current|main)\s+\w+\s+is\b/i,
];

const DISCARD_TRIGGERS: RegExp[] = [
  /\bforget\b/i,
  /\bignore\s+that\b/i,
  /\bno\s+longer\s+relevant\b/i,
  /\bclear\s+that\b/i,
  /\babandon\b/i,
  /\bignore\s+what\s+i\s+said\b/i,
  /\bdisregard\b/i,
];

// ─── Classifier ───────────────────────────────────────────────────────────────

function getExcerpt(content: string, maxLength = 120): string {
  if (typeof content !== "string") return "";
  return content.length <= maxLength ? content : content.slice(0, maxLength) + "…";
}

function getMessageContent(msg: any): string {
  const raw = msg.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part: any) => (part && typeof part.text === "string" ? part.text : ""))
      .join(" ");
  }
  return "";
}

/**
 * Deterministic, pure classifier for a slice of conversation messages.
 * Returns one or more ClassifiedSignal entries per message.
 * No LLM calls — O(n * regexes) complexity.
 */
export function classifyIncrement(messages: any[]): ClassifiedSignal[] {
  const signals: ClassifiedSignal[] = [];

  for (const msg of messages) {
    const msgType: string = typeof msg._getType === "function" ? msg._getType() : "";

    // Tool messages → always tool-result
    if (msgType === "tool") {
      const content = getMessageContent(msg);
      signals.push({
        type: "tool-result",
        source: "tool",
        excerpt: getExcerpt(content),
        requiresOperation: true,
      });
      continue;
    }

    // AI / assistant messages → no-content
    if (msgType === "ai") {
      signals.push({
        type: "no-content",
        source: "assistant",
        excerpt: "",
        requiresOperation: false,
      });
      continue;
    }

    // Human messages — run regex passes in priority order
    if (msgType === "human") {
      const content = getMessageContent(msg);
      let matched = false;

      // 1. Discard signals (highest priority)
      for (const pattern of DISCARD_TRIGGERS) {
        if (pattern.test(content)) {
          signals.push({
            type: "discard-signal",
            source: "user",
            excerpt: getExcerpt(content),
            requiresOperation: true,
          });
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 2. Preference triggers
      for (const pattern of PREFERENCE_TRIGGERS) {
        if (pattern.test(content)) {
          signals.push({
            type: "user-preference",
            source: "user",
            excerpt: getExcerpt(content),
            requiresOperation: true,
          });
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 3. Fact triggers
      for (const pattern of FACT_TRIGGERS) {
        if (pattern.test(content)) {
          signals.push({
            type: "user-stated-fact",
            source: "user",
            excerpt: getExcerpt(content),
            requiresOperation: true,
          });
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 4. Fallback — no extractable content
      signals.push({
        type: "no-content",
        source: "user",
        excerpt: "",
        requiresOperation: false,
      });
      continue;
    }

    // System or unknown message types — skip
  }

  return signals;
}
