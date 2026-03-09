import type { ListAgentActionsMessage, ListAgentActionsResponse } from "./agents";
import type { ResponseMessage } from "./worker-event.types";
import type { GetThreadMetadata, GetThreadResponse, RefreshThreadsMessage, RefreshThreadsResponse } from './chat';

export interface PingMessage {
  type: 'ping';
}

export type PongMessage = ResponseMessage<'ping', null>;

export type InboundMessage =
  | GetThreadMetadata
  | ListAgentActionsMessage
  | RefreshThreadsMessage
  | PingMessage;

export type OutboundMessage =
  | GetThreadResponse
  | ListAgentActionsResponse
  | RefreshThreadsResponse
  | PongMessage;

export type WorkerMessage = 
  | InboundMessage
  | OutboundMessage;
