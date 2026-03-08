import { z } from 'zod';
import { DateField } from '../types/util';

export enum ActionSeverity {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
  CRITICAL = 3,
}

const MessageBase = z.object({
  id: z.string(),
  content: z.string(),
  created_at: z.iso.datetime(),
  metadata: z.record(z.string(), z.any()).default({}),
});

const ChatMessageAssetSchema = z.object({
  id: z.number(),
  url: z.string(),
  mime_type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  nsfw: z.boolean().optional(),

});

export const InteractionSchema = MessageBase.extend({
  type: z.literal('chat_message'),
  role: z.string(),
  name: z.string().optional(),
  model: z.string().optional(),
  usage: z.number().optional(),
  assets: z.array(ChatMessageAssetSchema).optional().default([]),
});

export const ServerActionSchema = MessageBase.extend({
  type: z.literal('server_action'),
  role: z.string(),
  actions: z.array(z.object({
    label: z.string(),
    url: z.string().optional(),
    destructive: z.boolean().optional(),
  })).optional(),
  severity: z.enum(ActionSeverity).optional(), // For system messages, indicates the severity of the message (0 = info, 1 = warning, 2 = error, 3 = critical)
});

export const ChatMessageSchema = z.discriminatedUnion('type', [InteractionSchema, ServerActionSchema]);
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ServerAction = z.infer<typeof ServerActionSchema>;
export type InteractionMessage = z.infer<typeof InteractionSchema>;
export type ChatAsset = z.infer<typeof ChatMessageAssetSchema>;


export const threadResponseSchema = z.object({
  threadId: z.string(),
  title: z.string().nullable(),
  agent_id: z.number().nullable(),
  archived: z.boolean(),
  thread_id: z.string(),
  type: z.enum(['chat', 'agent']),

  created_at: DateField,
  updated_at: DateField,
  agent: z.object({
    id: z.number(),
    name: z.string(),
  }).nullable(),
  history: z.array(ChatMessageSchema),
});

export type ThreadResponse = z.infer<typeof threadResponseSchema>;