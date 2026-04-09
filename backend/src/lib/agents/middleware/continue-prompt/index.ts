import { z } from "zod";
import { createMiddleware } from "langchain";

/**
 * Custom middleware that mimics the "Continue?" behavior.
 * After N model calls, it interrupts to ask the user if they want to keep going.
 */
export function createContinuePromptMiddleware(callLimitBeforePrompt: number = 25) {
  return createMiddleware({
    name: "ContinuePromptMiddleware",
    stateSchema: z.object({
      runModelCallCount: z.number().default(0),
    }),
    contextSchema: z.object({
      callLimitBeforePrompt: z.number().default(25), // configurable threshold
    }),
  
    beforeModel: {
      canJumpTo: ["end"],
      hook: (state, runtime) => {
        const limit = runtime.context.callLimitBeforePrompt ?? 25;
  
        if (state.runModelCallCount >= limit) {
          // Interrupt execution — the caller gets an __interrupt__ response
          // and must resume with a Command to continue or stop
          const decision = runtime.interrupt?.({
            type: "continue_prompt",
            message: `Agent has made ${state.runModelCallCount} model calls. Would you like to continue?`,
            callsMade: state.runModelCallCount,
          });
  
          // If user says "no" or "stop", end the agent
          if (decision === "stop" || decision === "no") {
            return {
              jumpTo: "end" as const,
            };
          }
  
          // User said "continue" — reset the counter so we get another N calls
          // before asking again
          return {
            runModelCallCount: 0,
          };
        }
  
        return undefined; // no changes, proceed normally
      },
    },
  
    afterModel: (state) => ({
      runModelCallCount: state.runModelCallCount + 1,
    }),
  
    // Reset run count between invocations
    afterAgent: () => ({
      runModelCallCount: 0,
    }),
  });
}
