import { useCallback, useEffect } from 'preact/hooks';
import type { InboundMessage, OutboundMessage } from './messages';
import { useSignal } from '@preact/signals';
import Worker from '../worker.ts?worker';

const worker = new Worker();

type WorkerEventMap = {
  [K in OutboundMessage['type']]: Extract<OutboundMessage, { type: K }>;
};

class WorkerEmitter extends EventTarget {
  addEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (ev: CustomEvent<WorkerEventMap[K]>) => void,
    options?: AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ): void;
  addEventListener(type: string, listener: unknown, options?: unknown): void {
    super.addEventListener(type, listener as EventListener, options as AddEventListenerOptions);
  }

  removeEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (ev: CustomEvent<WorkerEventMap[K]>) => void,
    options?: EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions
  ): void;
  removeEventListener(type: string, listener: unknown, options?: unknown): void {
    super.removeEventListener(type, listener as EventListener, options as EventListenerOptions);
  }
}

const emitter = new WorkerEmitter();

worker.onmessage = (event: MessageEvent<OutboundMessage>) => {
  emitter.dispatchEvent(new CustomEvent(event.data.type, { detail: event.data }));
};

/**
 * Fire-and-forget: post a message to the worker without subscribing to a response.
 * Use this when the component does not own the response state (pub/sub publishers).
 * Use `useWorkerEvent` instead when the component both triggers and consumes the response.
 */
export function fireWorkerEvent(message: InboundMessage): void {
  worker.postMessage(message);
}

/**
 * Subscribe directly to an outbound worker event by its type.
 * Use this for streaming events that don't follow the request/response pattern
 * (e.g. `chat:stream:text_delta`, `chat:stream:done`, etc.).
 */
export function useWorkerEventListener<K extends OutboundMessage['type']>(
  type: K,
  callback: (ev: CustomEvent<Extract<OutboundMessage, { type: K }>>) => void,
): void {
  useEffect(() => {
    const controller = new AbortController();
    emitter.addEventListener(
      type as K,
      callback as (ev: CustomEvent<WorkerEventMap[K]>) => void,
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, []);
}

export function useWorkerEvent<
  TEventName extends InboundMessage['type'],
  TResponse extends OutboundMessage['type'] = Extract<OutboundMessage['type'], `${TEventName}:response`>,
  TError extends OutboundMessage['type'] = `${TEventName}:error` extends OutboundMessage['type'] ? `${TEventName}:error` : never
>(
  event: TEventName,
  callback: (ev: CustomEvent<WorkerEventMap[TResponse]>) => void,
  options?: {
    disableDebounce?: boolean;
    errorCallback?: (ev: CustomEvent<WorkerEventMap[TError]>) => void, 
  }
) {
  const isLoading = useSignal(false);

  const sendMessage = useCallback(
    (message: Omit<Extract<InboundMessage, { type: TEventName }>, 'type'>) =>{
      const loading = isLoading.peek();
      
      if (loading && !options?.disableDebounce) {
        console.log('Worker is busy, ignoring message:', { type: event, ...message });
        return;
      }
      
      isLoading.value = true;
      worker.postMessage({ type: event,  ...message });
    }, 
    []
  );

  useEffect(() => {
    const cleanup = new AbortController();
    
    emitter.addEventListener(
      `${event}:response` as TResponse,
      (e) => {
        isLoading.value = false;
        
        callback(e);
      },
      { signal: cleanup.signal }
    );

    emitter.addEventListener(
      `${event}:error` as TError,
      (e) => {
        isLoading.value = false;
        
        if (options?.errorCallback)
          options.errorCallback(e)
      },
      { signal: cleanup.signal }
    );

    return () => {
      cleanup.abort();
    }
  }, []);

  return sendMessage;
}
