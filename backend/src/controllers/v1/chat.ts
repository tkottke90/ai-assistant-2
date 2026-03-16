import { Router } from 'express';
import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import { checkpointer, prisma } from '../../lib/database';
import { ZodBodyValidator, ZodParamValidator } from '../../middleware/zod.middleware';
import z from 'zod';
import { InteractionSchema, ServerActionSchema, threadResponseSchema } from '../../lib/models/chat';
import crypto from 'node:crypto';
import ThreadDao from '../../lib/dao/thread.dao.js';
import ThreadMetadataDao from '../../lib/dao/thread-metadata.dao.js';
import { discoverTools } from '../../lib/tools/search';
import { createBuiltinTools } from '../../lib/tools/builtin/tools';

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

  // Set headers for HTTP chunked streaming
  res.setHeader('Content-Type', 'application/octet-stream');
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
        name: 'chat-agent',
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

    const metadata = await ThreadMetadataDao.findByThreadId(threadId as string);
    
    if (!metadata) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const history = await ThreadDao.getMessagesFromThread(checkpointer, threadId);

    res.setHeader('Cache-Control', 'no-store');
    res.json(
      threadResponseSchema.parse({
      ...metadata,
      threadId,
      agent: metadata.agent ? { id: metadata.agent.agent_id, name: metadata.agent.name } : null,
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
