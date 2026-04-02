import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createMiddleware, HumanMessage, SystemMessage, ToolCallRequest, ToolMessage } from "langchain";
import { Logger } from "winston";
import { Command, ReducedValue, StateSchema } from "@langchain/langgraph";
import z from "zod";
import { BaseError } from "@tkottke90/js-errors";

const LOG_PREFIX = (name: string = 'Agent') => `AgentRuntime.${name}.ToolSummary.`;

const ToolCallItemSchema = z.object({
  name: z.string(),
  timestamp: z.string(),
  args: z.any(),
  result: z.any(),
  summary: z.any(),
  artifacts: z.any(),
});

const ToolSummaryStateSchema = new StateSchema({
  toolCalls: new ReducedValue(
    z.array(ToolCallItemSchema).default(() => []),
    {
      inputSchema: z.union([ToolCallItemSchema, z.array(ToolCallItemSchema)]).optional(),
      reducer: (current, next) => {
        if (next === undefined) return current;           // init / no write
        if (Array.isArray(next)) return next;             // checkpoint restoration
        return [...current, next];                         // normal single-item append
      }
    }
  ),
});

export function createToolSummaryMiddleware(
  name: string,
  middlewareLogger: Logger,
  llm: BaseChatModel
) {
  return createMiddleware({
    name: 'tool-summary-middleware',
    stateSchema: ToolSummaryStateSchema,
    wrapToolCall: async (request, handler) => {
      const toolName = request?.tool?.name ?? 'UnknownTool';
      const logger = middlewareLogger.child({ location: LOG_PREFIX(name) + `wrapToolCall.${toolName}` });

      logger.info('Calling Tool', { args: request.toolCall.args });
    
      const toolMessage = await handler(request) as ToolMessage;
      
      // If the result is already a command, we can skip summarization
      if (toolMessage instanceof Command) {
        return toolMessage;
      }
      
      return summarize(request, toolMessage, llm, logger)
    }
  })
}


export async function summarize<
TToolCallReq extends ToolCallRequest,
TToolCallRes extends ToolMessage
>(req: TToolCallReq, res: TToolCallRes, llm: BaseChatModel, logger: Logger) {
  try {
    logger.info('Summarizing result');
    const summary = await llm.invoke([
      new SystemMessage([
        'Generate a short and consise summary of the following tool output' ,
        'If IDs are present, make sure to include them in the summary for tracking and further reference.',
        'The summary should be no more than a few sentences, and focus on the key information and results from the tool call.'
      ].join(' ')),
      new HumanMessage(res.content)
    ], { callbacks: [] });
  
  
    return new Command({
      update: {
        messages: [
        new ToolMessage({
          ...res,
          content: summary.content,
          metadata: {
            ...res.metadata,
            original: res.content,
          }
        })
      ],
        toolCalls: {
          name: req.tool?.name ?? 'UnknownTool',
          timestamp: new Date().toISOString(),
          args: req.toolCall.args,
          result: res.content,
          summary: summary.content,
          artifacts: res.artifact,
        }
      }
    })
  } catch (err) {
    const error = BaseError.fromCatch(err);

    logger.error('Error during tool summarization', { error });

    return res; // return original result on failure to summarize, to avoid blocking the agent's progress due to summarization issues
  }
}