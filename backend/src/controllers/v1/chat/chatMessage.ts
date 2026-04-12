import { AIMessage, ToolMessage, BaseMessage, createAgent, HumanMessage, AIMessageChunk } from "langchain";
import express from 'express';
import { checkpointer } from '@/lib/database';
import { Logger } from "winston";
import { ChatMessage, InteractionSchema, ServerActionSchema } from '@/lib/models/chat';
import ChatDao from '@/lib/dao/chat.dao';
import ThreadDao from '@/lib/dao/thread.dao';
import { BaseError } from "@tkottke90/js-errors";
import { Message } from "ollama";
import { ChatData } from "./chat-data";
import crypto from 'node:crypto';
import { createUsageMiddleware } from "@/lib/agents/middleware/usage";

type ChatHistoryEntry =
  | { kind: "tool_calling";    message: AIMessage }
  | { kind: "tool_complete";   message: ToolMessage }
  | { kind: "final_response";  message: AIMessage };

type MessageChunk = { mode: 'thinking' | 'tool_call' | 'responding', content: string, messageId?: string, title?: string };

export function classifyMessage(msg: BaseMessage): ChatHistoryEntry | null {
  switch (msg.type) {
    case "ai": {
      const aiMsg = msg as AIMessage;
      if (aiMsg.tool_calls?.length) {
        return { kind: "tool_calling", message: aiMsg };
      }
      if (aiMsg.content) {
        return { kind: "final_response", message: aiMsg };
      }
      return null;
    }
    case "tool":
      return { kind: "tool_complete", message: msg as ToolMessage };
    default:
      return null;
  }
}

export async function chatHandler(
  req: express.Request,
  res: express.Response
) {
  const { message, threadId, alias, model, agentId } = req.body;

  // Set headers for HTTP chunked streaming
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Load the appropriate LLM client based on alias/model
    const llm = (alias && model)
      ? req.app.llm.getClientWithModel(alias, model)
      : req.app.llm.getClient(alias);

    // Create the agent instance
    let agent;
    let agent_id = agentId ?? -1;

    if (agentId != null) {
      // If an agentId is provided, have the agent process the message with the existing agent runtime
      const agentManager = req.app.agents;
      const runtime = agentManager.getAgent(agentId);

      // If no runtime exists for the given agentId, or if the agent is not active, return an error
      if (!runtime || !agentManager.isActive(agentId)) {
        res.write(`data: ${JSON.stringify({ error: 'Agent not found or not active' })}\n\n`);
        res.end();
        return;
      }

      // Log the incoming message and agent details for debugging
      runtime.logger.info('Reviewing Message', runtime.agentDetails);

      // Setup our abort controller to allow for cancellation if the client disconnects
      const abortController = new AbortController();
      res.on('close', () => abortController.abort());

      // Assign the agent runtime to our variable
      agent = await runtime.getAgent(abortController.signal);
    } else {
      // Create a generic agent instance without an existing runtime (for ad-hoc messages not tied to a specific agent)
      agent = createAgent({
        model: llm,
        checkpointer,
        name: 'chat-agent',
        middleware: [
          createUsageMiddleware(llm, 'chat-agent', req.logger)
        ]
      });
    }

    // Construct message objects
    const userMessage = new HumanMessage(message)
    const aiMessageData = new ChatData();

    // Invoke the agent
    const stream = agent.stream(
      { messages: [ userMessage ] },
      { streamMode: ["messages", "values"], configurable: { thread_id: threadId, agent_id }, recursionLimit: 500 }
    );

    // Iterate over the stream and send updates to the client as they arrive
    req.logger.info('Starting streamed response');
    for await (const [streamMode, chunk] of await stream) {

      switch (streamMode) {
        // Messages are individual chunks of information streamed from the agent,
        // they can be passed directly to the client for real-time updates on the agent's progress.
        case 'messages':
          req.logger.silly('Received message chunk:', chunk);

          aiMessageData.nextChunk(chunk[0], streamMode);
          break;
          
        // Values are inputs at the end of each stage of the agent's process, they give wholesale
        // values all at once unlike `messages` which are incremental. Like a snapshot of the entire
        // chat history, we need to go through each message in this case
        case 'values': {
          const msgs = chunk.messages as BaseMessage[];
          
          // When the chat data is empty, we know we are processing the first
          // event. We should only process the most recent message because the 
          // values stream sends the entire message history
          if (!aiMessageData.activeChunk) {
            msgs
              // Add the message history to the chat data to skip them in the future
              .forEach(m => {
                if (m instanceof ToolMessage) {
                  aiMessageData.addHistoricalChunkId(m.tool_call_id);
                } else if (m.id) {
                  aiMessageData.addHistoricalChunkId(m.id);
                }
              });

            aiMessageData.nextChunk(msgs.at(-1)!, streamMode);
            break;
          }

          for (const msg of msgs) {
            aiMessageData.nextChunk(msg, streamMode);
          }
          break;
        }
      }

      res.write(`data: ${JSON.stringify(
        aiMessageData.toChatMessage(agent.options.name)
      )}\n`);
    }

    // After stream is done we can update our records in the database
    req.logger.debug('Stream ended, updating chat history');
    updateChatHistory(
      threadId,
      InteractionSchema.parse({
        type: 'chat_message',
        id: crypto.randomUUID(),
        content: message,
        role: 'human',
        created_at: new Date().toISOString(),
        metadata: {},
      }), 
      aiMessageData.toChatMessage(agent.options.name)
    );

    // Signal completion
    req.logger.debug('Full response sent');
    res.write('done: [DONE]\n\n');
    res.end();
  } catch (error) {
    const err = BaseError.fromCatch(error);

    req.logger.error(err.toString());
    res.write(`data: ${JSON.stringify({ kind: 'error', message: err.message })}\n\n`);
    res.end();
  }
}

async function updateChatHistory(threadId: string, inputMessage: ChatMessage, outputMessage: ChatMessage) {
  // Get last message in the thread to use as the parent for the new messages we're adding to the history
  const lastMessage = await ChatDao.getChatByThreadId(threadId).then(messages => messages.at(-1));

  // Add the user's input message to the history
  const { node_id: humanId } = await ChatDao.createChatMessage(threadId, inputMessage, lastMessage ? lastMessage.node_id : undefined);

  // Add the assistant's response to the history, linking it to the user's message
  await ChatDao.createChatMessage(threadId, outputMessage, humanId);
}