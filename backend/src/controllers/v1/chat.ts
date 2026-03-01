import { Router } from 'express';
import { createAgent } from 'langchain';
import { checkpointer, prisma } from '../../lib/database';
import { ZodBodyValidator, ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { InteractionSchema, ServerActionSchema, threadHistoryResponseSchema } from '../../lib/models/chat';
import { BaseMessage } from 'langchain';
import crypto from 'node:crypto';
import ThreadDao from '../../lib/dao/thread.dao.js';

export const router = Router();

const ChatRequestSchema = z.object({
  message: z.string(),
  threadId: z.string(),
  alias: z.string().optional(),
  model: z.string().optional(),
  agentId: z.number().optional(),
});

router.post('/', ZodBodyValidator(ChatRequestSchema), async (req, res) => {
  const { message, threadId, alias, model, agentId } = req.body;

  // Set headers for Server-Sent Events streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const llm = (alias && model)
      ? req.app.llm.getClientWithModel(alias, model)
      : req.app.llm.getClient(alias);

    let agent;

    if (agentId != null) {
      const agentManager = req.app.agents;
      const runtime = agentManager.getAgent(agentId);

      if (!runtime || !agentManager.isActive(agentId)) {
        res.write(`data: ${JSON.stringify({ error: 'Agent not found or not active' })}\n\n`);
        res.end();
        return;
      }

      const abortController = new AbortController();
      res.on('close', () => abortController.abort());
      agent = runtime.getAgent(abortController.signal);
    } else {
      agent = createAgent({
        model: llm,
        checkpointer,
        name: 'chat-agent'
      });
    }

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

router.get('/threads', async (req, res) => {
  try {
    const rows = await prisma.checkpoints.findMany({
      select: { thread_id: true },
      distinct: ['thread_id'],
      orderBy: { checkpoint_id: 'desc' },
    });

    const threads = rows.map(row => row.thread_id);
    res.json({ threads });
  } catch (error) {
    req.logger.error('Failed to list threads:', error);
    res.status(500).json({ error: 'Failed to list threads' });
  }
});


router.get(
  '/:threadId',
  ZodParamValidator(z.object({ threadId: z.string() })),
  async (req, res) => {
    const { threadId } = req.params

    const history = await ThreadDao.getMessagesFromThread(checkpointer, threadId);

    res.json(
      threadHistoryResponseSchema.parse({
      threadId,
      history: history
        .filter(({ msg }) => msg.content !== '') // Filter out empty messages (placeholders for thinking)
        .map(({ msg, ts }) => {
          switch(msg.type) {
            case 'tool':
              return ServerActionSchema.parse({
                type: 'server_action',
                id: msg.id,
                content: msg.content,
                created_at: ts,
                metadata: msg.additional_kwargs,
                role: msg.type,
                actions: (msg.response_metadata as Record<string, any>)?.actions || [],
                severity: (msg.response_metadata as Record<string, any>)?.severity ?? 0,
              })
            case 'ai':
            case 'human':
            default: {
              return InteractionSchema.parse({
                type: 'chat_message',
                id: msg.id,
                content: msg.content,
                name: msg.name,
                created_at: ts,
                metadata: msg.additional_kwargs,
                role: msg.type,
                model: (msg.response_metadata as Record<string, any>)?.model,
              })
            }
          }
        }) 
    })
  );
});

export default router;
