import { prisma } from '../database.js';
import { ChatMessage } from '../models/chat.js';

export function createChatMessage(threadId: string, input: ChatMessage, parentId?: number) {
  return prisma.$transaction(async (tx) => {
    const node = await tx.node.create({
      data: {
        type: 'chat_message',
        properties: { ...input, threadId } as object,
        created_at: new Date(input.created_at),
      },
    });

    if (parentId != null) {
      await tx.edge.create({
        data: {
          source_id: parentId,
          target_id: node.node_id,
          type: 'NEXT_MSG',
          properties: {},
        },
      });
    }

    return node;
  });
}

export function getChatByThreadId(threadId: string) {
  return prisma.node.findMany({
    where: {
      type: 'chat_message',
      properties: {
        path: '$.threadId',
        equals: threadId,
      }
    },
    orderBy: {
      created_at: 'asc',
    },
  });
}