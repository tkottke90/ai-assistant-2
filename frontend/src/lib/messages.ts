import type { ListAgentActionsMessage, ListAgentActionsResponse } from "./agents";
import type { ResponseMessage } from "./worker-event.types";
import type { GetThreadMetadata, GetThreadResponse } from './chat';

export interface PingMessage {
  type: 'ping';
}

export type PongMessage = ResponseMessage<'ping', null>;

export type InboundMessage =
  | GetThreadMetadata
  | ListAgentActionsMessage
  | PingMessage;

export type OutboundMessage =
  | GetThreadResponse
  | ListAgentActionsResponse
  | PongMessage;

export type WorkerMessage = 
  | InboundMessage
  | OutboundMessage;
