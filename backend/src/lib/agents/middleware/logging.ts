import { createMiddleware } from "langchain";
import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const CustomState = new StateSchema({
  usage: z.number().default(0),
});

export const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  stateSchema: CustomState,
  beforeModel: (state) => {
    console.log(`About to call model with ${state.messages.length} messages`);
    return;
  },

  afterModel: (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    console.log(`Model returned: ${lastMessage.content}`);
    return { usage: (state.usage ?? 0) + 1 };
  },
}); 