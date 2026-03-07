import { prisma } from '../database.js';
import { ChatMessage } from '../models/chat.js';

export function createChat(input: ChatMessage) {
  return prisma.node.create({
    data: {
      type: input.type,
      properties: input as object,
    }
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