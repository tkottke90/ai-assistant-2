import type { ListAgentActionsMessage, ListAgentActionsResponse, RefreshAgentsMessage, RefreshAgentsResponse } from "./agents";
import type { ResponseMessage } from "./worker-event.types";
import type { GetThreadMetadata, GetThreadResponse, RefreshThreadsMessage, RefreshThreadsResponse, ResumeStreamMessage, StreamChatMessage, WorkerStreamEvent, WorkerStreamControlEvent } from './chat';
import type { TrackEvalMessage, EvalResultUpdateResponse } from './eval-worker';

export interface PingMessage {
  type: 'ping';
}

export type PongMessage = ResponseMessage<'ping', null>;

export type InboundMessage =
  | GetThreadMetadata
  | ListAgentActionsMessage
  | RefreshAgentsMessage
  | RefreshThreadsMessage
  | ResumeStreamMessage
  | StreamChatMessage
  | TrackEvalMessage
  | PingMessage;

export type OutboundMessage =
  | GetThreadResponse
  | ListAgentActionsResponse
  | RefreshAgentsResponse
  | RefreshThreadsResponse
  | WorkerStreamEvent
  | WorkerStreamControlEvent
  | EvalResultUpdateResponse
  | PongMessage;

export type WorkerMessage = 
  | InboundMessage
  | OutboundMessage;
