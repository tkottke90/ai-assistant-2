import { Message } from '@langchain/core/messages';
import { BaseNodeSchema, Node } from './node';
import {z} from 'zod';

const ChatFieldsSchema = z.object({
  id: z.number(),
  thread_id: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant'])
});

const ChatMessageSchema = z.object({
  id: z.number(),
  thread_id: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant']),
  author: z.string().default('assistant')
});

type ChatMessageSchema = z.infer<typeof ChatMessageSchema>;

class ChatMessage {
  id: number;
  thread_id: string;
  content: string;
  role: 'user' | 'assistant';

  readonly type = 'chat_message';

  constructor(data: unknown) {
    const parsed = ChatMessageSchema.parse(data);

    this.id = parsed.id;
    this.thread_id = parsed.thread_id;
    this.content = parsed.content;
    this.role = parsed.role;
  }

  fromLangChainMessage(message: Message): ChatMessage {
    return new ChatMessage({
      id: 0, // This will be set by the database
      thread_id: '', // This should be set when creating a new message in a thread
      content: message.content,
      role: message.type === 'human' ? 'user' : 'assistant',
    });
  }

  fromNode(node: Node): ChatMessage {


    return new ChatMessage({
      id: 0, // This will be set by the database
      thread_id: node.properties.threadId,
      content: node.properties.message,
      role: node.properties.role,
    });
  }

  toNode(): Node {
    return BaseNodeSchema.parse({
      node_id: this.id,
      type: this.type,
      properties: {
        message: this.content,
        role: this.role,
        threadId: this.thread_id,
      }
    });
  }
}

export { ChatMessage, ChatMessageSchema };