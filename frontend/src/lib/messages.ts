import type { ListAgentActionsMessage, ListAgentActionsResponse } from "./agents";
import type { ResponseMessage } from "./worker-event.types";
import type { GetThreadMetadata, GetThreadResponse, RefreshThreadsMessage, RefreshThreadsResponse, StreamChatMessage, WorkerStreamEvent } from './chat';
import type { TrackEvalMessage, EvalResultUpdateResponse } from './eval-worker';

export interface PingMessage {
  type: 'ping';
}

export type PongMessage = ResponseMessage<'ping', null>;

export type InboundMessage =
  | GetThreadMetadata
  | ListAgentActionsMessage
  | RefreshThreadsMessage
  | StreamChatMessage
  | TrackEvalMessage
  | PingMessage;

export type OutboundMessage =
  | GetThreadResponse
  | ListAgentActionsResponse
  | RefreshThreadsResponse
  | WorkerStreamEvent
  | EvalResultUpdateResponse
  | PongMessage;

export type WorkerMessage = 
  | InboundMessage
  | OutboundMessage;
