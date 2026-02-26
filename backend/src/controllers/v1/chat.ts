import { ChatOllama } from '@langchain/ollama';
import { Router } from 'express';
import { createAgent } from 'langchain';
import { checkpointer } from '../../lib/database';
import {ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { InteractionSchema, threadHistoryResponseSchema } from '../../lib/models/chat';
import { BaseMessage } from 'langchain';
import crypto from 'node:crypto';

export const router = Router();

const llm = new ChatOllama({
  model: 'qwen3:8b',
})

const agent = createAgent({
  model: llm,
  checkpointer,
  name: 'test-agent'
});

router.post('/', async (req, res) => {
  const { message, threadId } = req.body;

  // Set headers for Server-Sent Events streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = agent.stream(
      { messages: [{ role: "user", content: message }] },
      { streamMode: ["updates", "messages", "custom"], configurable: { thread_id: threadId } }
    );

    req.logger.debug('Starting streamed response');
    for await (const [streamMode, chunk] of await stream) {
      // Send each chunk to the client
      const data = JSON.stringify({ mode: streamMode, chunk });
      res.write(`data: ${data}\n\n`);
    }

    const ckpt = await checkpointer.get({ configurable: { thread_id: threadId } })

    const lastMsgs = (ckpt?.channel_values as any)?.messages.slice(-2) || [];

    // Signal completion
    req.logger.debug('Full response sent');
    res.write('done: [DONE]\n\n');
    res.end();
  } catch (error) {
    req.logger.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
    res.end();
  }
});

router.post('/new-thread', async (req, res) => {
  res.json({ threadId: crypto.randomUUID() });
});





router.get(
  '/:threadId',
  ZodParamValidator(z.object({ threadId: z.string() })),
  async (req, res) => {
    const { threadId } = req.params
    
    const historyGen = await checkpointer.list({ configurable: { thread_id: threadId } });

    // The History is a generator function.  We should convert
    // it to an array before sending it to the client.
    const historyIds = new Set();
    const history: BaseMessage[] = [];
    for await (const item of historyGen) {
      const values = item.checkpoint.channel_values

      if (values['messages']) {
        for (const msg of values['messages'] as BaseMessage[]) {
          if (!historyIds.has(msg.id)) {
            historyIds.add(msg.id);
            history.push(msg);
          }
        }
      }
    }

    res.json(threadHistoryResponseSchema.parse({
      threadId,
      history: history.map(msg => InteractionSchema.parse({
        type: 'chat_message',
        id: msg.id,
        content: msg.content,
        name: msg.name,
        created_at: new Date().toISOString(),
        metadata: msg.additional_kwargs,
        role: msg.type,
      }))
    }));
  }
);



export default router;