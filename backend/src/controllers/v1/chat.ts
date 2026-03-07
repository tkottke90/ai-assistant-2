import { Router } from 'express';
import { createAgent } from 'langchain';
import { checkpointer, prisma } from '../../lib/database';
import { ZodBodyValidator, ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { InteractionSchema, ServerActionSchema, threadHistoryResponseSchema } from '../../lib/models/chat';
import { BaseMessage } from 'langchain';
import crypto from 'node:crypto';
import ThreadDao from '../../lib/dao/thread.dao.js';
import ThreadMetadataDao from '../../lib/dao/thread-metadata.dao.js';

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
      agent = await runtime.getAgent(abortController.signal);
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

// --- Thread Management ---

const NewThreadSchema = z.object({
  agent_id: z.number().int().optional(),
  type: z.enum(['chat', 'agent']).default('chat'),
});

router.post('/new-thread', ZodBodyValidator(NewThreadSchema), async (req, res): Promise<void> => {
  const { agent_id, type } = req.body as z.infer<typeof NewThreadSchema>;

  // Enforce one agent thread per agent
  if (type === 'agent' && agent_id) {
    const existing = await ThreadMetadataDao.findAgentThread(agent_id);
    if (existing) {
      res.json({ thread_id: existing.thread_id });
      return;
    }
  }

  const thread_id = crypto.randomUUID();
  await ThreadMetadataDao.upsert(thread_id, { agent_id: agent_id ?? null, type });
  res.json({ thread_id });
});

router.get('/threads', async (req, res): Promise<void> => {
  try {
    const archived = req.query.archived === 'true';

    if (archived) {
      const archivedThreads = await ThreadMetadataDao.listArchived();
      res.json({ threads: archivedThreads });
      return;
    }

    // Fetch metadata and raw checkpoint thread IDs in parallel
    const [allMetadata, checkpointRows] = await Promise.all([
      ThreadMetadataDao.listActive(),
      prisma.checkpoints.findMany({
        select: { thread_id: true },
        distinct: ['thread_id'],
      }),
    ]);

    const metadataMap = new Map(allMetadata.map(m => [m.thread_id, m]));

    // Backfill metadata for checkpoint threads that have no metadata row yet.
    // Skip threads that already have a row (including archived ones).
    const backfillPromises: Promise<any>[] = [];
    for (const { thread_id } of checkpointRows) {
      if (!metadataMap.has(thread_id)) {
        backfillPromises.push(
          ThreadMetadataDao.findByThreadId(thread_id).then(existing => {
            if (!existing) {
              return ThreadMetadataDao.upsert(thread_id, {}).then(row => metadataMap.set(thread_id, row));
            }
            // Row exists but is archived — don't add to the active map
            return;
          }),
        );
      }
    }
    await Promise.all(backfillPromises);

    const all = [...metadataMap.values()];

    const agentManager = req.app.agents;
    const agentThreads = all
      .filter(t => t.type === 'agent' && t.agent != null && agentManager.isActive(t.agent!.agent_id))
      .map(t => ({ ...t, agentName: t.agent!.name }));

    const threads = all.filter(t => t.type === 'chat');

    res.json({ threads, agentThreads });
  } catch (error) {
    req.logger.error('Failed to list threads:', error);
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

router.get('/threads/:threadId', async (req, res): Promise<void> => {
  const threadId = req.params.threadId as string;
  const meta = await ThreadMetadataDao.findByThreadId(threadId);
  if (!meta) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }
  res.json(meta);
});

const PatchThreadSchema = z.object({
  title: z.string().optional(),
  archived: z.boolean().optional(),
  agent_id: z.number().int().nullable().optional(),
});

router.patch('/threads/:threadId', ZodBodyValidator(PatchThreadSchema), async (req, res) => {
  const threadId = req.params.threadId as string;
  const data = req.body as z.infer<typeof PatchThreadSchema>;
  const updated = await ThreadMetadataDao.upsert(threadId, data);
  res.json(updated);
});

router.delete('/threads/:threadId', async (req, res): Promise<void> => {
  const threadId = req.params.threadId as string;
  const existing = await ThreadMetadataDao.findByThreadId(threadId);
  if (!existing) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }
  await ThreadMetadataDao.deleteThread(threadId);
  res.status(204).send();
});

router.post('/threads/:threadId/summarize', async (req, res): Promise<void> => {
  const threadId = req.params.threadId as string;

  const history = await ThreadDao.getMessagesFromThread(checkpointer, threadId);
  if (history.length === 0) {
    res.status(404).json({ error: 'Thread not found or has no messages' });
    return;
  }

  const excerpt = history
    .slice(0, 6)
    .map(({ msg }) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return `${msg.type}: ${content}`;
    })
    .join('\n');

  const llm = req.app.llm.getClient();
  const response = await llm.invoke([
    { role: 'system', content: 'Summarize the following conversation in 8 words or fewer. Return only the summary, nothing else.' },
    { role: 'user', content: excerpt },
  ]);

  const title = (response.content as string).trim();
  await ThreadMetadataDao.upsert(threadId, { title });
  res.json({ title });
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
