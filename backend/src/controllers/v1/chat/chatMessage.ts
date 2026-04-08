import { AIMessage, ToolMessage, BaseMessage, createAgent, HumanMessage } from "langchain";
import express from 'express';
import { checkpointer } from '@/lib/database';
import { Logger } from "winston";
import { ChatMessage, InteractionSchema, ServerActionSchema } from '@/lib/models/chat';
import { createChatMessage } from '@/lib/dao/chat.dao';
import ThreadDao from '@/lib/dao/thread.dao';
import crypto from 'node:crypto';
import { BaseError } from "@tkottke90/js-errors";

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


/**
 * Process `value` stream chunks from the LangChain runnable. It determines
 * the kind of chunk (tool calling, tool complete, or final response), emits
 * events to the frontend, and returns any new BaseMessages for the chat history.
 *
 * @param chunk - The values chunk from the LangChain stream
 * @param res - Express response used to write SSE events
 * @param logger - Logger instance
 * @param previousMessageCount - Number of messages seen before this chunk (for diffing)
 * @returns The new messages added in this chunk, the updated total message count, and parsed ChatMessage objects for persistence
 */
export function processValueChunk(
  chunk: any,
  res: express.Response,
  logger: Logger,
  previousMessageCount: number
): { messages: BaseMessage[]; messageCount: number; chatMessages: ChatMessage[] } {
  logger.silly('Processing value chunk:', chunk);

  const allMessages: BaseMessage[] = chunk.messages ?? [];
  const justAdded = allMessages.slice(previousMessageCount);
  const newMessages: BaseMessage[] = [];
  const chatMessages: ChatMessage[] = [];

  for (const msg of justAdded) {
    const entry = classifyMessage(msg);
    if (!entry) continue;

    switch (entry.kind) {
      case 'tool_calling':
        for (const toolCall of entry.message.tool_calls ?? []) {
          res.write(`data: ${JSON.stringify({ mode: 'tool_calling', data: { name: toolCall.name, id: toolCall.id } })}\n\n`);
        }
        newMessages.push(entry.message);
        break;

      case 'tool_complete': {
        const severity = 
          (entry.message.response_metadata as Record<string, any>)?.severity
          ?? (entry.message.status === 'error' ? 2 : 0);
        
        
        const serverAction = ServerActionSchema.parse({
          type: 'server_action',
          id: entry.message.id,
          content: typeof entry.message.content === 'string' ? entry.message.content : JSON.stringify(entry.message.content),
          created_at: new Date().toISOString(),
          metadata: {
            // Add Generic Tool Summary as a fallback if one is not provided
            tool_summary: `Tool Used: ${entry.message.name}`,
            args: {},
            ...entry.message.response_metadata,
            ...entry.message.additional_kwargs
          },
          role: entry.message.type,
          actions: (entry.message.response_metadata as Record<string, any>)?.actions ?? [],
          severity,
        });
        res.write(`data: ${JSON.stringify({ mode: 'tool_complete', toolCallId: entry.message.tool_call_id, data: serverAction })}\n\n`);
        newMessages.push(entry.message);
        chatMessages.push(serverAction);
        break;
      }

      case 'final_response': {
        const interaction = InteractionSchema.parse({
          type: 'chat_message',
          id: entry.message.id,
          content: typeof entry.message.content === 'string' ? entry.message.content : JSON.stringify(entry.message.content),
          name: entry.message.name,
          created_at: new Date().toISOString(),
          metadata: entry.message.additional_kwargs,
          role: entry.message.type,
          model: (entry.message.response_metadata as Record<string, any>)?.model,
          usage: ThreadDao.getMessageUsage(entry.message),
          stats: {
            ...ThreadDao.getGenerationDetails(entry.message),
          },
        });
        res.write(`data: ${JSON.stringify({ mode: 'final_response', data: interaction })}\n\n`);
        newMessages.push(entry.message);
        chatMessages.push(interaction);
        break;
      }
    }
  }

  return { messages: newMessages, messageCount: allMessages.length, chatMessages };
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
      });
    }

    // Persist the human message as a Node before streaming starts
    const humanMsg = InteractionSchema.parse({
      type: 'chat_message',
      id: crypto.randomUUID(),
      content: message,
      role: 'human',
      created_at: new Date().toISOString(),
      metadata: {},
    });
    const humanNode = await createChatMessage(threadId, humanMsg);
    let lastNodeId: number = humanNode.node_id;

    // Construct the user message
    const newMessages: BaseMessage[] = [
      new HumanMessage(message)
    ];
    let previousMessageCount = 0;

    // Invoke the agent
    const stream = agent.stream(
      { messages: newMessages },
      { streamMode: ["messages", "values"], configurable: { thread_id: threadId }, recursionLimit: 50 }
    );


    // Iterate over the stream and send updates to the client as they arrive
    req.logger.debug('Starting streamed response');
    for await (const [streamMode, chunk] of await stream) {

      switch (streamMode) {
        // Messages are individual chunks of information streamed from the agent,
        // they can be passed directly to the client for real-time updates on the agent's progress.
        case 'messages':
          req.logger.silly('Received message chunk:', chunk);
          
          const message = chunk[0];
          const hasContent = message.type === 'ai' && message.content;
          const hasReasoning = message.type === 'ai' && (
            (message.additional_kwargs as Record<string, any>)?.reasoning_content ||
            (message.response_metadata as Record<string, any>)?.reasoning_content
          );
          if (hasContent || hasReasoning) {
            // Pass through text deltas and reasoning/thinking chunks
            const data = JSON.stringify({
              mode: 'message',
              chunk: {
                id: message.id,
                content: message.content,
                name: message.name,
                metadata: message.additional_kwargs,
                response_metadata: message.response_metadata,
              }
            });
            res.write(`data: ${data}\n\n`);
          }

          break;

        // Values are inputs at the end of each stage of the agent's process, they give wholesale
        // values all at once unlike `messages` which are incremental. Like a snapshot of the last
        // step the agent took.
        case 'values': {
          const result = processValueChunk(chunk, res, req.logger, previousMessageCount);
          newMessages.push(...result.messages);
          previousMessageCount = result.messageCount;
          for (const chatMsg of result.chatMessages) {
            const node = await createChatMessage(threadId, chatMsg, lastNodeId);
            lastNodeId = node.node_id;
          }
          break;
        }
        default:
          req.logger.warn('Received unknown stream mode:', streamMode);
      }
    }

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