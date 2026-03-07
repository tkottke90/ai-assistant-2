import { prisma } from '../database.js';

function findByThreadId(threadId: string) {
  return prisma.threadMetadata.findUnique({
    where: { thread_id: threadId },
    include: { agent: true },
  });
}

function upsert(
  threadId: string,
  data: { agent_id?: number | null; type?: string; title?: string; archived?: boolean },
) {
  return prisma.threadMetadata.upsert({
    where: { thread_id: threadId },
    create: { thread_id: threadId, ...data },
    update: { ...data },
    include: { agent: true },
  });
}

function listActive() {
  return prisma.threadMetadata.findMany({
    where: { archived: false },
    include: { agent: true },
    orderBy: { updated_at: 'desc' },
  });
}

function listArchived() {
  return prisma.threadMetadata.findMany({
    where: { archived: true },
    include: { agent: true },
    orderBy: { updated_at: 'desc' },
  });
}

function findAgentThread(agentId: number) {
  return prisma.threadMetadata.findFirst({
    where: { agent_id: agentId, type: 'agent' },
    include: { agent: true },
  });
}

async function deleteThread(threadId: string) {
  // Delete LangGraph checkpoint data first
  await prisma.writes.deleteMany({ where: { thread_id: threadId } });
  await prisma.checkpoints.deleteMany({ where: { thread_id: threadId } });
  // Delete the metadata row
  await prisma.threadMetadata.delete({ where: { thread_id: threadId } });
}

export default {
  findByThreadId,
  upsert,
  listActive,
  listArchived,
  findAgentThread,
  deleteThread,
};
