import { createMiddleware } from "langchain";
import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";
import { Logger } from "winston";

const CustomState = new StateSchema({
  usage: z.number().default(0),
});

export const createLoggingMiddleware = (logger: Logger) => createMiddleware({
  name: "LoggingMiddleware",
  stateSchema: CustomState,
  beforeModel: (state) => {
    logger.debug(`About to call model with ${state.messages.length} messages`);
    return;
  },

  afterModel: (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    logger.debug(`Model returned: ${lastMessage.content}`);
    return { usage: (state.usage ?? 0) + 1 };
  },

  wrapToolCall: async (request, handler) => {
    logger.debug('[wrapToolCall] Calling Tool', { toolName: request.toolCall.name, args: request.toolCall.args });

    const result = await handler(request);

    logger.debug('[wrapToolCall] Tool Result', { result });

    return result;
  }
}); 