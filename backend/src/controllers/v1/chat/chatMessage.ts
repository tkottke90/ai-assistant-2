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
import { GraphRecursionError } from '@langchain/langgraph';


type ChatHistoryEntry =
  | { kind: "tool_calling";    message: AIMessage }
  | { kind: "tool_complete";   message: ToolMessage }
  | { kind: "final_response";  message: AIMessage };

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

  // Initialize AI Message Data to keep track of the current message being constructed from the stream
  const aiMessageData = new ChatData();
  let agentName = 'chat-agent';

  // Initialize chat history for this request
  const chatHistory: ChatMessage[] = [];

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
        res.write(`done: ${JSON.stringify({ kind: 'error', message: 'Agent not found or not active' })}\n\n`);
        res.end();
        return;
      }

      // Log the incoming message and agent details for debugging
      runtime.logger.info('Reviewing Message', runtime.agentDetails);

      // Assign the agent runtime to our variable
      agent = await runtime.getAgent();
      agentName = runtime.name;
    } else {
      // Create a generic agent instance without an existing runtime (for ad-hoc messages not tied to a specific agent)
      agent = createAgent({
        model: llm.withRetry({ stopAfterAttempt: 3 }),
        checkpointer,
        name: agentName,
        middleware: [
          createUsageMiddleware(llm, agentName, req.logger)
        ]
      });
    }

    // Setup our abort controller to allow for cancellation if the client disconnects
    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    // Construct message objects
    const userMessage = new HumanMessage(message);

    chatHistory.push(
      InteractionSchema.parse({
        type: 'chat_message',
        id: crypto.randomUUID(),
        content: message,
        role: 'human',
        created_at: new Date().toISOString(),
        metadata: {},
      }),
    );

    // Invoke the agent
    const stream = agent.stream(
      { messages: [ userMessage ] },
      { 
        streamMode: ["messages", "values"], 
        configurable: { thread_id: threadId, agent_id },
        recursionLimit: 500,
        signal: abortController.signal
      }
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
    
    chatHistory.push(aiMessageData.toChatMessage(agentName));

    // Signal completion
    req.logger.debug('Full response sent');
    res.write(`done: ${JSON.stringify(aiMessageData.toChatMessage(agentName))}\n\n`);
  } catch (error) {
    
    chatHistory.push(aiMessageData.toChatMessage(agentName));

    if (error instanceof GraphRecursionError) {
      chatHistory.push(ServerActionSchema.parse({
        type: 'server_action',
        id: crypto.randomUUID(),
        role: 'assistant',
        severity: 2,           // red
        content: 'The agent hit the recursion limit and could not complete your request. You can retry the same message.',
        created_at: new Date().toISOString(),
        metadata: { retry_message: message },   // carries the original user message
        actions: [{ label: 'Retry' }],
      }));

      res.write(`done: ${JSON.stringify({ kind: 'error', message: error.message })}\n\n`);

    } else if (error instanceof Error && 'name' in error && error.name === 'AbortError') {
      req.logger.error('Client disconnected, aborting agent execution', { code: (error as any).code, stack: error.stack });
        
      res.write(`done: ${JSON.stringify({ kind: 'error', message: 'Client disconnected, agent execution aborted' })}\n\n`);
    } else {

      debugger;

      const err = BaseError.fromCatch(error);
      req.logger.error(err.toString());
      res.write(`done: ${JSON.stringify({ kind: 'error', message: err.message })}\n\n`);
    }

  } finally {
    await updateChatHistory(threadId, chatHistory)


    res.end();
  }
}

async function updateChatHistory(threadId: string, messages: ChatMessage[]) {
  // Get last message in the thread to use as the parent for the new messages we're adding to the history
  const lastMessage = await ChatDao.getChatByThreadId(threadId).then(messages => messages.at(-1));

  let lastNodeId = lastMessage?.node_id;

  for (const message of messages) {
    const { node_id } = await ChatDao.createChatMessage(threadId, message, lastNodeId);

    lastNodeId = node_id;
  }
}