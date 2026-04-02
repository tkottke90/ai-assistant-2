import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StateSchema } from "@langchain/langgraph";
import { BaseError } from "@tkottke90/js-errors";
import { BaseMessage, createMiddleware, HumanMessage, SystemMessage } from "langchain";
import { Logger } from "winston";
import * as z from "zod";
import RecursivePrompt from "./recursive.prompt";
import { Scratchpad } from "./recursive/scratchpad";
import { ChatOllama } from "@langchain/ollama";
import { BaseSection } from "./recursive/sections";


const LOG_PREFIX = (name: string = 'Agent') => `AgentRuntime.${name}.Scratchpad.`;

const ScratchpadUpdateItemSchema = z.object({
  type: z.enum(["append", "refine", "rewrite"]).describe('The type of action that should be taken on the section'),
  section: z.string().describe('The name of the section to update'),
  content: z.string().describe('The content to add or replace'),
  description: z.string().optional().describe('Optional description for the section (only used when creating a new section or on rewrite)'),
  justification: z.string().describe('A brief explanation of why this update is being made, to assist in future recall of the information')
});

const ScratchpadUpdateSchema = z.object({
  updates: z.array(ScratchpadUpdateItemSchema).describe('List of scratchpad section updates. Return an empty array if nothing is worth recording.'),
});


/** Returns a valid empty scratchpad XML string. */
export function buildEmptyScratchpad(): string {
  return '<scratchpad><toc></toc><sections></sections></scratchpad>';
}

export function getAgentScratchpad(agentName: string | undefined, state: Record<string, any>): Scratchpad | undefined {
  if (!agentName) {
    return;
  }

  const scratchPadStr = state.scratchpad?.[agentName] ?? buildEmptyScratchpad();

  return Scratchpad.fromXML(scratchPadStr);
}

export async function constructContext(scratchpad: Scratchpad, messages: BaseMessage[], llm: BaseChatModel, logger: Logger) {
  const search = scratchpad.traverse(5);

  const collectedSections: BaseSection[] = [];
  let searchResults = search.next();

  while (!searchResults.done) {
    // Load the next batch of candidates to consider for traversal into the context
    const { depth, candidates } = searchResults.value;
    logger.debug('Scratchpad traversal yielded candidates', { candidates, depth });

    if (!candidates || candidates.length === 0) {
      logger.debug('No sections selected for traversal, ending traversal early');
      break;
    }

    // Prompt the model to select sections
    const response = await llm.invoke([
      new SystemMessage(Scratchpad.traversalPrompt),
      new HumanMessage('**Table of Contents:**\n' + candidates.map((c) => `- ${c.name}: ${c.description}`).join("\n")),
      ...messages
    ], { callbacks: [] }); // see note above re: { callbacks: [] }

    // Extract the content
    const contextContent = JSON.parse(response.content as string);

    const selectedSections: string[] = contextContent?.sections;

    logger.debug('Selected sections for traversal', { selectedSections, contextContent });

    searchResults = search.next(selectedSections);
  }

  logger.debug('Scratchpad traversal complete', { collectedSections: collectedSections.map(s => s.name) });

  return collectedSections.map(s => `**${s.name}** - ${s.content}`).join("\n\n");
}


export const ScratchpadStateSchema = new StateSchema({
  /** The XML scratchpad document, persisted by the checkpointer per thread_id. */
  scratchpad: z.record(z.string(), z.string().default(() => buildEmptyScratchpad())).default({}),
  /** Private: set to true after the first model call of a turn to prevent double-injection. */
  _scratchpadActive: z.boolean().default(false),
  /** Private: section names already retrieved this turn — prevents circular traversal. */
  _visitedSections: z.array(z.string()).default([]),
});

export function createRecursiveScratchpadMiddleware(name: string | undefined, llm: BaseChatModel, middlewareLogger: Logger) {
  return createMiddleware({
    name: "recursive-scratchpad",
    stateSchema: ScratchpadStateSchema,

    beforeAgent: async (state) => {
      const logger = middlewareLogger.child({ location: LOG_PREFIX(name) + 'beforeAgent' });

      const agentName = name;

      if (!agentName) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return {};
      }

      const scratchpad = getAgentScratchpad(agentName, state);

      if (!scratchpad) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return {};
      }

      // Update user goal before the agent runs so that it is available to the 
      // agent and reflected in the scratchpad for this turn.  We expect it will help
      // guide tool, memory, and context selection
      const goal = scratchpad.getSection('current-goal')?.content;
      const newGoal = await RecursivePrompt.updateGoal(state, logger, goal);

      if (newGoal) {
        logger.info('Updating current goal', { newGoal: newGoal.content });

        scratchpad.rewriteSection("current-goal", { content: newGoal.content.toString(), description: "The user's current goal in one concise sentence" });
      }

      return {};
    },

    /**
     * After the model has generated it's response, we want it to collect
     * insights that it has gathered from the conversation and store them in
     * the scratchpad.  This will allow it to recall these insights later
     */
    afterAgent: async (state) => {
      const logger = middlewareLogger.child({ location: LOG_PREFIX(name) + 'afterAgent' });

      const agentName = name;

      if (!agentName) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return {};
      }

      const scratchpad = getAgentScratchpad(agentName, state);
      
      if (!scratchpad) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return {};
      }

      // { callbacks: [] } intentionally breaks out of LangGraph's inherited streaming
      // callback chain so these internal tokens are not forwarded to the client response
      // stream. These calls are internal housekeeping and are intentionally excluded from
      // monitoring traces. If trace visibility is needed, pass a dedicated reflectionLlm
      // parameter to this factory and wire it up from AgentRuntime.
      const response = await llm.withStructuredOutput(ScratchpadUpdateSchema).invoke(
        [...state.messages.slice(-8), RecursivePrompt.update_prompt(scratchpad.sectionList())],
        { callbacks: [] }
      );

      try {
        const data = response.updates;

        if (data.length === 0) {
          logger.info("No updates to the scratchpad were identified by the model this turn.");
          return;
        }

        logger.debug(`Applying ${data.length} updates to the scratchpad`);
        logger.debug(`Updates`, { updates: data });
        for (const update of data) {
          const { type, section, content, description } = update;

          if(section === 'current-goal') {
            logger.warn('The "current-goal" section is reserved for tracking the agents\'s current goal and can not be manipulated by the afterAgent reflection');
            continue;
          }

          if (section.startsWith("tool:")) {
            logger.warn('Tool sections can not be manipulated by the afterAgent reflection');
            continue; // Tool sections are handled separately in the wrapToolCall middleware
          }

          switch (type) {
            case "append":
              logger.debug("Appending to section", { section });

              scratchpad.appendSection(section, content);
              break;
            case "refine": {
              logger.debug("Refining section", { section });

              const refinement = await llm.invoke([
                RecursivePrompt.refine_prompt(
                  section,
                  scratchpad.sectionList().find((s) => s.name === section)?.content ?? "",
                  content
                )
              ], { callbacks: [] }); // see note above re: { callbacks: [] }

              scratchpad.rewriteSection(section, { content: refinement.content.toString(), description });
              logger.debug("Refinement complete", { section });
              break;
            }
            case "rewrite":
              logger.debug("Rewriting section", { section });
              scratchpad.rewriteSection(section, { content, description });
              break;
            default:
              logger.warn("Unknown scratchpad update type", { type });
          }
        }

        // Update user goal
        const goal = scratchpad.getSection('current-goal')?.content;
        const newGoal = await RecursivePrompt.updateGoal(state, logger, goal);

        if (newGoal) {
          logger.info('Updating current goal', { newGoal: newGoal.content });

          scratchpad.rewriteSection("current-goal", { content: newGoal.content.toString(), description: "The user's current goal in one concise sentence" });
        }

      } catch (err) {
        const error = err instanceof Error ? err : new Error(`${err}`);

        logger.error("Failed to apply scratchpad updates", { error: error, response });
        debugger;
      }

      logger.info("Scratchpad updated successfully");
      return {
        scratchpad: {
          ...state.scratchpad,
          [agentName]: scratchpad.toXML()
        },
      };
    },

    wrapModelCall: async (request, handler) => {
      const logger = middlewareLogger.child({ location: LOG_PREFIX(name) + 'wrapModelCall' });
      const { state } = request;

      const agentName = name;

      if (!agentName) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return handler(request);
      }

      // Use LLM to identify sections of the scratchpad to include in the context window
      // Pull the scratchpad information relevant to the current conversation and inject it into the context
      const scratchpad = getAgentScratchpad(agentName, state);
      
      if (!scratchpad) {
        logger.warn("LLM does not have a name property, scratchpads are agent-specific");
        return handler(request);
      }

      logger.info("Collecting context from scratchpad");
      
      try {
        // Get the messages without any system messages
        const messages = state.messages.filter((msg) => !(msg instanceof SystemMessage));

        const contextContent = await constructContext(
          scratchpad,
          messages.slice(-6), // Only include the last 6 messages to prevent token overload from the middleware
          llm,
          logger
        )

        logger.debug('Context sections identified by the model', { context: contextContent });

        // No need to inject any context if the model didn't identify any relevant sections this turn
        if (!contextContent) {
          return handler(request);
        }

        return handler({
          ...request,
          systemMessage: request.systemMessage.concat(
            new SystemMessage(`\n---\n\n Scratchpad Notes:\n\n${contextContent}\n\n---`)
          ),
          messages: state.messages.slice(-8),
        });
      } catch (err) {
        debugger;

        const error = BaseError.fromCatch(err);

        logger.error("Error in scratchpad middleware, proceeding without scratchpad context", { error });

        // Allow the request to continue unblocked by the scratchpad middleware in the event of an error
        return handler(request);
      }
    }
  });
}
