/**
 * Custom async Chai assertions powered by promptfoo.
 *
 * Import this module once (side-effect import) before any test that uses the
 * custom assertions:
 *
 *   import '@test/promptfoo-assertions.js';
 *
 * Available assertions:
 *   await expect(str).toPassLLMRubric('criteria text', gradingConfig?)
 *   await expect(str).toMatchSemanticSimilarity('expected text', threshold?)
 */

import { Assertion } from "chai";
import { assertions } from "promptfoo";
import type { GradingConfig } from "promptfoo";

// Extend Chai's Assertion interface so TypeScript recognises these methods.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Chai {
    interface Assertion {
      toPassLLMRubric(
        criteria: string,
        gradingConfig?: GradingConfig,
      ): Promise<void>;
      toMatchSemanticSimilarity(
        expected: string,
        threshold?: number,
      ): Promise<void>;
    }
  }
}

const { matchesSimilarity, matchesLlmRubric } = assertions;

const DEFAULT_GRADING_CONFIG: GradingConfig = {
  provider: "openai:chat:Qwen3-4B-GGUF",
};

// chai's addMethod returns whatever the callback returns; returning a Promise
// makes `expect(x).toPassLLMRubric(...)` itself a Promise that callers can await.
Assertion.addMethod(
  "toPassLLMRubric",
  function (
    this: any,
    criteria: string,
    gradingConfig: GradingConfig = DEFAULT_GRADING_CONFIG,
  ) {
    const received: string = this._obj;
    return matchesLlmRubric(criteria, received, gradingConfig).then((result) => {
      this.assert(
        result.pass,
        `expected output to pass LLM rubric "${criteria}" but failed.\nReason: ${result.reason}\n\nOutput was:\n${received}`,
        `expected output NOT to pass LLM rubric "${criteria}"`,
        criteria,
      );
    });
  },
);

Assertion.addMethod(
  "toMatchSemanticSimilarity",
  function (
    this: any,
    expected: string,
    threshold = 0.8,
  ) {
    const received: string = this._obj;
    return matchesSimilarity(received, expected, threshold).then((result) => {
      const pass = received === expected || result.pass;
      this.assert(
        pass,
        `expected output to match semantic similarity with "${expected}" (threshold=${threshold}), but it did not.\nReason: ${result.reason}`,
        `expected output NOT to match semantic similarity with "${expected}"`,
        expected,
      );
    });
  },
);
