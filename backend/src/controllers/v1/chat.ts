import { Router } from 'express';
import { createAgent } from 'langchain';
import { checkpointer } from '../../lib/database';
import { ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { InteractionSchema, threadHistoryResponseSchema } from '../../lib/models/chat';
import { BaseMessage } from 'langchain';
import crypto from 'node:crypto';

export const router = Router();

router.post('/', async (req, res) => {
  const { message, threadId, alias, model } = req.body;

  // Set headers for Server-Sent Events streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const llm = (alias && model)
      ? req.app.llm.getClientWithModel(alias, model)
      : req.app.llm.getClient(alias);

    const agent = createAgent({
      model: llm,
      checkpointer,
      name: 'chat-agent'
    });

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
    // Checkpoints are newest-first; by overwriting `ts` on every occurrence
    // we end up with the oldest (creation-time) checkpoint timestamp for each message.
    const historyMap = new Map<string, { msg: BaseMessage; ts: string }>();

    for await (const item of historyGen) {
      const values = item.checkpoint.channel_values;
      const ts = item.checkpoint.ts;

      if (values['messages']) {
        for (const msg of values['messages'] as BaseMessage[]) {
          if (!historyMap.has(msg.id!)) {
            historyMap.set(msg.id!, { msg, ts });
          } else {
            // Overwrite with the older timestamp as we walk backwards in time
            historyMap.get(msg.id!)!.ts = ts;
          }
        }
      }
    }

    const history = Array.from(historyMap.values());

    res.json(threadHistoryResponseSchema.parse({
      threadId,
      history: history.map(({ msg, ts }) => InteractionSchema.parse({
        type: 'chat_message',
        id: msg.id,
        content: msg.content,
        name: msg.name,
        created_at: ts,
        metadata: msg.additional_kwargs,
        role: msg.type,
      }))
    }));
  }
);



export default router;