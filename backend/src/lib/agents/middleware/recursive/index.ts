import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { readFileSync } from "fs";
import { AIMessage as LCAIMessage, createMiddleware, HumanMessage, SystemMessage } from "langchain";
import { Logger } from "winston";
import z from "zod";
import { ScratchpadConfig, ScratchpadConfigSchema } from "../../../config/agents.schema";
import { Scratchpad } from "./scratchpad";
import { BaseSection, DEFAULT_TTL, ToolSection } from "./sections";

export type { ScratchpadConfig };

// ─── Prompt ──────────────────────────────────────────────────────────────────

const REFLECTION_PROMPT = readFileSync(
  new URL("../../prompts/scratchpad-reflection.md", import.meta.url),
  "utf-8",
);

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ScratchpadStateSchema = z.object({
  /** Monotonically incrementing turn counter. Never derived from messages.length. */
  turnCount: z.number().default(0),
  /** Full scratchpad XML, serialized as a string. Empty on turn 1. */
  scratchpad: z.string().default(""),
  /** Guard: prevents beforeModel from running more than once per outer turn. */
  __beforeModelHasRun: z.boolean().default(false),
  /** Index into state.messages marking the start of the next reflection window. */
  __reflectionMessageIndex: z.number().default(0),
});

const FORBIDDEN_NAMES = new Set([
  "notes",
  "summary",
  "info",
  "misc",
  "data",
  "content",
]);

const SPECIFIC_NAME = z.string().refine((n) => !FORBIDDEN_NAMES.has(n.toLowerCase()), {
  message: "Generic section names (notes, summary, info, misc, data, content) are not allowed",
});

export const ScratchpadOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("append"),
    name: SPECIFIC_NAME,
    description: z.string(),
    type: z.enum(["tool", "text"]),
    initialTTL: z.number().int().min(1).max(10).optional(),
    content: z.string(),
  }),
  z.object({
    op: z.literal("rewrite"),
    name: SPECIFIC_NAME,
    content: z.string(),
  }),
  z.object({
    op: z.literal("remove"),
    name: SPECIFIC_NAME,
  }),
]);

export type ScratchpadOperation = z.infer<typeof ScratchpadOperationSchema>;

export const ReflectionOutputSchema = z.object({
  operations: z.array(ScratchpadOperationSchema),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTOC(sp: Scratchpad): string {
  return sp.sectionList()
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");
}

type ResolvedScratchpadConfig = Required<Omit<ScratchpadConfig, 'llm' | 'model'>>;

function applyOperations(
  sp: Scratchpad,
  ops: ScratchpadOperation[],
  turnCount: number,
  cfg: ResolvedScratchpadConfig,
  logger: Logger,
): { appended: number; rewritten: number; removed: number } {
  let appended = 0;
  let rewritten = 0;
  let removed = 0;

  for (const op of ops) {
    if (op.op === "append") {
      const initialTTL =
        op.type === "tool"
          ? (cfg.initialTTL.tool ?? DEFAULT_TTL.tool)
          : (cfg.initialTTL.text ?? DEFAULT_TTL.text);

      const ttl = op.initialTTL ?? initialTTL;
      let section: BaseSection;
      if (op.type === "tool") {
        section = new ToolSection(op.name.replace(/^tool:/, ""), op.description, turnCount, ttl);
      } else {
        section = new BaseSection(op.name, op.description, op.content, turnCount, ttl);
      }

      logger.debug("Scratchpad: append section", { name: op.name });
      sp.addSection(section);
      appended++;
    } else if (op.op === "rewrite") {
      logger.debug("Scratchpad: rewrite section", { name: op.name });
      sp.rewriteSection(op.name, { content: op.content });
      rewritten++;
    } else if (op.op === "remove") {
      logger.debug("Scratchpad: remove section", { name: op.name });
      sp.removeSection(op.name);
      removed++;
    }
  }

  return { appended, rewritten, removed };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

const LOG_PREFIX = (name: string) => `AgentRuntime.${name}.Scratchpad`;

export function createScratchpadMiddleware(
  agentName: string,
  llm: BaseChatModel,
  middlewareLogger: Logger,
  config?: ScratchpadConfig,
  scratchpadLlm?: BaseChatModel,
) {
  const parsed = ScratchpadConfigSchema.parse(config ?? {});
  const cfg: ResolvedScratchpadConfig = {
    recentTurns: parsed.recentTurns,
    selectionCredit: parsed.selectionCredit,
    sectionCreditCap: parsed.sectionCreditCap,
    initialTTL: { tool: parsed.initialTTL.tool, text: parsed.initialTTL.text },
    graveyardTTL: parsed.graveyardTTL,
    maxSectionSize: parsed.maxSectionSize,
  };
  const reflectionLlm = scratchpadLlm ?? llm;

  return createMiddleware({
    name: "scratchpad",
    stateSchema: ScratchpadStateSchema,

    // ── beforeModel ────────────────────────────────────────────────────────
    // Runs before every LLM call within a turn.
    // The guard (__beforeModelHasRun) ensures we only increment the counter
    // and inject context once per outer turn (the first LLM call).
    beforeModel: async (state: any) => {
      if (state.__beforeModelHasRun) return;

      const logger = middlewareLogger.child({
        location: LOG_PREFIX(agentName) + ".beforeModel",
      });

      const turnCount: number = (state.turnCount ?? 0) + 1;
      const sp = Scratchpad.fromXML(state.scratchpad || undefined);
      const sectionCount = sp.sectionList().length;

      const update: Record<string, any> = {
        turnCount,
        __beforeModelHasRun: true,
        __reflectionMessageIndex: state.messages?.length ?? 0,
      };

      if (sectionCount > 0) {
        sp.applySelectionCredits(turnCount, cfg.selectionCredit, cfg.sectionCreditCap);
        const updatedXml = sp.toXML();
        update.scratchpad = updatedXml;

        // Inject scratchpad into the model's context window.
        // Using a fixed message ID causes LangGraph's addMessages reducer
        // to replace (not duplicate) it on subsequent turns.
        update.messages = [
          new SystemMessage({
            id: `${agentName}__scratchpad-working-memory`,
            content: `<working-memory>\n${updatedXml}\n</working-memory>`,
          }),
        ];

        logger.info('scratchpad.llm_engine', {
          value: reflectionLlm._llmType(),
          turn: turnCount
        });
        
        logger.info('scratchpad.llm_model', { 
          value: (reflectionLlm as any).model ?? 'unknown', 
          turn: turnCount
        });

        const tokensInjected = Math.ceil(updatedXml.length / 4);
        logger.info("scratchpad.tokens_injected", {
          value: tokensInjected,
          turn: turnCount,
        });
        logger.info("scratchpad.section_count", {
          value: sectionCount,
          turn: turnCount,
        });
      } else {
        logger.info("scratchpad.tokens_injected", { value: 0, turn: turnCount });
        logger.info("scratchpad.section_count", { value: 0, turn: turnCount });
      }

      return update;
    },

    // ── wrapModelCall ──────────────────────────────────────────────────────
    // Trims the message window passed to the model WITHOUT modifying state.
    // The full conversation history remains in the checkpoint.
    wrapModelCall: async (request: any, handler: (req: any) => any) => {
      const messages: any[] = request.messages ?? [];
      const systemMessages = messages.filter((m: any) => m._getType() === "system");
      const otherMessages = messages.filter((m: any) => m._getType() !== "system");
      const trimmedOthers = otherMessages.slice(-cfg.recentTurns);
      const messagesTrimmed = otherMessages.length - trimmedOthers.length;

      if (messagesTrimmed > 0) {
        middlewareLogger.info("scratchpad.messages_trimmed", {
          value: messagesTrimmed,
          location: LOG_PREFIX(agentName) + ".wrapModelCall",
        });
      }

      return handler({ ...request, messages: [...systemMessages, ...trimmedOthers] });
    },

    // ── afterModel ─────────────────────────────────────────────────────────
    // Runs after every LLM call within a turn.
    // Calls the reflection LLM, applies scratchpad operations, runs pruning,
    // and persists the updated scratchpad to the checkpoint.
    afterModel: async (state: any) => {
      const logger = middlewareLogger.child({
        location: LOG_PREFIX(agentName) + ".afterModel",
      });

      // Determine incremental messages since the last afterModel call
      const reflectionStart: number = state.__reflectionMessageIndex ?? 0;
      const incrementalMessages: any[] = (state.messages ?? []).slice(reflectionStart);
      const newReflectionIndex = (state.messages ?? []).length;

      // Determine if this is the final LLM call for this turn (no pending tool calls)
      const lastMsg = (state.messages ?? []).at(-1);
      const isFinalCall = !(lastMsg instanceof LCAIMessage && lastMsg.tool_calls?.length);

      const startTime = Date.now();
      let reflectionErrors = 0;
      let reflectionRetries = 0;
      let ops: ScratchpadOperation[] = [];

      const sp = Scratchpad.fromXML(state.scratchpad || undefined);
      const toc = buildTOC(sp);

      const reflectionInput = new HumanMessage(
        [
          "Review the current conversation and the existing scratchpad sections.  Then determine if any updates need to be made",
          
          "## Current TOC",
          toc.length > 0 ? toc : "(empty — no sections yet)",
          "",
        ].join("\n"),
      );

      try {
        const result = await reflectionLlm
          .withStructuredOutput(ReflectionOutputSchema)
          .withRetry({ stopAfterAttempt: 3, onFailedAttempt: (err, input) => {
            reflectionErrors++;
            reflectionRetries++;

            logger.warn("Scratchpad reflection failed, retrying", {
              error: (err as Error).message,
              attempt: err.attemptNumber,
              retriesLeft: err.retriesLeft,
            });

            logger.debug("Scratchpad reflection input at time of failure", { input });
          }})
          .invoke([
              new SystemMessage(REFLECTION_PROMPT),
              ...incrementalMessages,
              reflectionInput
            ], {
            callbacks: [],
          });

        logger.info("Reflection LLM output", { ops: result.operations.length, result });

        ops = result.operations;
      } catch (err) {
        reflectionErrors++;
        logger.error("Scratchpad reflection failed after all retries, skipping update", {
          error: (err as Error).message,
        });
        ops = [];
      }

      const reflectionLatencyMs = Date.now() - startTime;

      // Apply operations
      const { appended, rewritten, removed } = applyOperations(sp, ops, state.turnCount ?? 0, cfg, logger);

      // Run pruning
      const { pruned, tombstonesPruned } = sp.prune(state.turnCount ?? 0, cfg.graveyardTTL);

      // Check for maxSectionSize violations (warning only in MVP)
      let sectionSizeExceeded = 0;
      for (const section of sp.sectionList()) {
        if (section.content.length > cfg.maxSectionSize) {
          sectionSizeExceeded++;
          logger.warn("scratchpad.section_size_exceeded", {
            section: section.name,
            size: section.content.length,
            maxSectionSize: cfg.maxSectionSize,
            turn: state.turnCount,
          });
        }
      }

      const updatedXml = sp.toXML();

      // Emit metrics
      logger.info("scratchpad.reflection_latency_ms", { value: reflectionLatencyMs, turn: state.turnCount });
      if (reflectionErrors > 0) logger.info("scratchpad.reflection_errors", { value: reflectionErrors, turn: state.turnCount });
      if (reflectionRetries > 0) logger.info("scratchpad.reflection_retries", { value: reflectionRetries, turn: state.turnCount });
      logger.info("scratchpad.ops.append", { value: appended, turn: state.turnCount });
      logger.info("scratchpad.ops.rewrite", { value: rewritten, turn: state.turnCount });
      logger.info("scratchpad.ops.remove", { value: removed, turn: state.turnCount });
      logger.info("scratchpad.ops.total", { value: ops.length, turn: state.turnCount });
      logger.info("scratchpad.sections_pruned", { value: pruned, turn: state.turnCount });
      logger.info("scratchpad.tombstones_pruned", { value: tombstonesPruned, turn: state.turnCount });
      logger.info("scratchpad.size_chars", { value: updatedXml.length, turn: state.turnCount });
      if (sectionSizeExceeded > 0) logger.info("scratchpad.section_size_exceeded", { value: sectionSizeExceeded, turn: state.turnCount });

      const stateUpdate: Record<string, any> = {
        scratchpad: updatedXml,
        __reflectionMessageIndex: newReflectionIndex,
      };

      if (isFinalCall) {
        // Reset the guard so the next outer turn's beforeModel fires correctly
        stateUpdate.__beforeModelHasRun = false;
      }

      return stateUpdate;
    },
  });
}
