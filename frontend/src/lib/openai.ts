import { z } from 'zod';

// WebRTCデータチャネルで受信するメッセージの型定義
// Zodスキーマの定義
const sessionCreatedSchema = z.object({
  type: z.literal('session.created'),
});

const sessionUpdatedSchema = z.object({
  type: z.literal('session.updated'),
});

const conversationItemCreatedSchema = z.object({
  type: z.literal('conversation.item.created'),
  item: z.object({
    content: z.array(z.unknown()),
    id: z.string(),
    object: z.literal('realtime.item'),
    role: z.enum(['user', 'assistant']),
    status: z.enum(['in_progress', 'completed']),
    type: z.literal('message'),
  }),
  previous_item_id: z.string().nullable(),
});

const responseCreatedSchema = z.object({
  type: z.literal('response.created'),
});

const rateLimitsUpdatedSchema = z.object({
  type: z.literal('rate_limits.updated'),
  event_id: z.string(),
  rate_limits: z.array(z.object({
    name: z.enum(['requests', 'tokens']),
    limit: z.number(),
    remaining: z.number(),
    reset_seconds: z.number(),
  })),
});

const responseOutputItemAddedSchema = z.object({
  type: z.literal('response.output_item.added'),
});

const responseContentPartAddedSchema = z.object({
  type: z.literal('response.content_part.added'),
});

const responseTextDeltaSchema = z.object({
  type: z.literal('response.text.delta'),
  delta: z.string(),
});

const responseTextDoneSchema = z.object({
  type: z.literal('response.text.done'),
});

const responseOutputItemDoneSchema = z.object({
  type: z.literal('response.output_item.done'),
});

const responseContentPartDoneSchema = z.object({
  type: z.literal('response.content_part.done'),
});

const responseDoneSchema = z.object({
  type: z.literal('response.done'),
});

// ユニオン型のスキーマ
export const receivedDataChannelMessageSchema = z.discriminatedUnion('type', [
  sessionCreatedSchema,
  sessionUpdatedSchema,
  conversationItemCreatedSchema,
  responseCreatedSchema,
  rateLimitsUpdatedSchema,
  responseOutputItemAddedSchema,
  responseContentPartAddedSchema,
  responseTextDeltaSchema,
  responseTextDoneSchema,
  responseOutputItemDoneSchema,
  responseContentPartDoneSchema,
  responseDoneSchema,
]);

export type ReceivedDataChannelMessage = z.infer<typeof receivedDataChannelMessageSchema>;

export function parseReceivedDataChannelMessage(value: unknown): ReceivedDataChannelMessage {
  return receivedDataChannelMessageSchema.parse(value);
}
