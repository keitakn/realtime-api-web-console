// WebRTCデータチャネルで受信するメッセージの型定義
type SessionCreatedMessage = {
  type: 'session.created';
};

type SessionUpdatedMessage = {
  type: 'session.updated';
};

type ConversationItemCreatedMessage = {
  type: 'conversation.item.created';
  item: unknown;
  previous_item_id: string;
};

type ResponseCreatedMessage = {
  type: 'response.created';
};

type RateLimitsUpdatedMessage = {
  type: 'rate_limits.updated';
  rate_limits: {
    requests_remaining: number;
    tokens_remaining: number;
  };
};

type ResponseOutputItemAddedMessage = {
  type: 'response.output_item.added';
};

type ResponseContentPartAddedMessage = {
  type: 'response.content_part.added';
};

type ResponseTextDeltaMessage = {
  type: 'response.text.delta';
  delta: string;
};

type ResponseTextDoneMessage = {
  type: 'response.text.done';
};

type ResponseOutputItemDoneMessage = {
  type: 'response.output_item.done';
};

type ResponseContentPartDoneMessage = {
  type: 'response.content_part.done';
};

type ResponseDoneMessage = {
  type: 'response.done';
};

export type ReceivedDataChannelMessage =
  | SessionCreatedMessage
  | SessionUpdatedMessage
  | ConversationItemCreatedMessage
  | ResponseCreatedMessage
  | RateLimitsUpdatedMessage
  | ResponseOutputItemAddedMessage
  | ResponseContentPartAddedMessage
  | ResponseTextDeltaMessage
  | ResponseTextDoneMessage
  | ResponseOutputItemDoneMessage
  | ResponseContentPartDoneMessage
  | ResponseDoneMessage;
