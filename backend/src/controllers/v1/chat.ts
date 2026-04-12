import { Router } from 'express';
import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import { checkpointer, prisma } from '../../lib/database';
import { ZodBodyValidator, ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { ChatMessageSchema, InteractionSchema, ServerActionSchema, threadResponseSchema } from '../../lib/models/chat';
import crypto from 'node:crypto';
import ThreadMetadataDao from '../../lib/dao/thread-metadata.dao.js';
import ChatDao from '@/lib/dao/chat.dao.js';
import { chatHandler } from './chat/chatMessage';

export const router = Router();

const ChatRequestSchema = z.object({
  message: z.string(),
  threadId: z.string(),
  alias: z.string().optional(),
  model: z.string().optional(),
  agentId: z.number().optional(),
});

router.post('/', ZodBodyValidator(ChatRequestSchema), chatHandler);

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

const SeedThreadSchema = z.object({
  message: z.string().min(1),
  title: z.string().min(1),
});

router.post('/new-thread-with-message', ZodBodyValidator(SeedThreadSchema), async (req, res): Promise<void> => {
  const { message, title } = req.body as z.infer<typeof SeedThreadSchema>;

  const thread_id = crypto.randomUUID();
  await ThreadMetadataDao.upsert(thread_id, { title, type: 'chat' });

  const llm = req.app.llm.getClient();
  const agent = createAgent({ model: llm, checkpointer, name: 'chat-agent' });
  await agent.updateState(
    { configurable: { thread_id } },
    { messages: [new HumanMessage(message)] },
  );

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

    // Fetch all metadata rows and raw checkpoint thread IDs in parallel.
    // Using listAll() (not listActive()) so that archived threads are included
    // in the map, preventing a per-thread findByThreadId query for each one.
    const [allMetadata, checkpointRows] = await Promise.all([
      ThreadMetadataDao.listAll(),
      prisma.checkpoints.findMany({
        select: { thread_id: true },
        distinct: ['thread_id'],
      }),
    ]);

    const metadataMap = new Map(allMetadata.map(m => [m.thread_id, m]));

    // Backfill metadata only for checkpoint threads that have no row at all.
    const backfillPromises: Promise<any>[] = [];
    for (const { thread_id } of checkpointRows) {
      if (!metadataMap.has(thread_id)) {
        backfillPromises.push(
          ThreadMetadataDao.upsert(thread_id, {}).then(row => metadataMap.set(thread_id, row)),
        );
      }
    }
    await Promise.all(backfillPromises);

    // Only surface active (non-archived) threads in the response.
    const all = [...metadataMap.values()].filter(t => !t.archived);

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

  const nodes = await getChatByThreadId(threadId);
  if (nodes.length === 0) {
    res.status(404).json({ error: 'Thread not found or has no messages' });
    return;
  }

  const excerpt = nodes
    .slice(0, 6)
    .map((n) => {
      const msg = ChatMessageSchema.parse(n.properties);
      return `${msg.role}: ${msg.content}`;
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

    const metadata = await ThreadMetadataDao.findByThreadId(threadId as string);
    
    if (!metadata) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const nodes = await ChatDao.getChatByThreadId(threadId as string);

    res.setHeader('Cache-Control', 'no-store');

    const response = {
      ...metadata,
      threadId,
      agent: metadata.agent ? { id: metadata.agent.agent_id, name: metadata.agent.name } : null,
      consumption: 0,
      history: nodes.map(n => ChatMessageSchema.parse(n.properties)),
    };


    response.consumption = response.history.reduce((sum, msg) => {
      if (msg.type === 'chat_message') {
        return sum + (msg.usage?.total ?? 0);
      }
      return sum;
    }, 0);

    res.json(
      threadResponseSchema.parse(response)
  );
});

export default router;
