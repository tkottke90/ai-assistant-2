import { type Inputs, useCallback, useEffect } from "preact/hooks";

export function registerEvent(
  element: EventTarget,
  eventName: string,
  event: (e: Event) => void
) {
  if (element) {
    element.addEventListener(eventName, event);
  }

  return () => {
    if (element) {
      element.removeEventListener(eventName, event);
    }
  };
}

export function useEventListener<
  TMap = HTMLElementEventMap & WindowEventMap & DocumentEventMap,
  TEventName extends keyof TMap & string = keyof TMap & string
>(
  element: EventTarget | null,
  eventName: TEventName,
  event: (e: TMap[TEventName]) => void,
  inputs: Inputs = []
) {
  useEffect(() => {
    if (!element) return;

    const signal = new AbortController();

    element.addEventListener(eventName, event as EventListener, { signal: signal.signal });

    return () => {
      signal.abort();
    };
  }, inputs);
}

export function useHtmlElementListeners(
  events: [eventName: string, event: (e: Event) => void][],
  inputs: Inputs = []
) {
  return useCallback((node: HTMLElement | null) => {
    // Skip of no node is present
    if (!node) return;

    // Loop over each event provided and register it with the node
    const eventListeners = events.map(
      ([name, eventFn]) => registerEvent(node, name, eventFn )
    );

    // Register a cleanup method which unsubscribes from each
    // event during the unmounting process
    return () => {
      eventListeners.map(unsubscriber => unsubscriber())
    }
  }, inputs)
}

/**
 * Copy text to clipboard using the modern Clipboard API
 * @param input - The text to copy to clipboard
 * @returns Promise that resolves on success or rejects on failure
 * @throws Error if Clipboard API is not available or permission is denied
 */
export async function copyToClipboard(input: string): Promise<void> {
  // Check if the Clipboard API is available
  if (!navigator.clipboard) {
    throw new Error('Clipboard API not available in this browser');
  }

  try {
    // Use the modern Clipboard API to write text
    await navigator.clipboard.writeText(input);
  } catch (error) {
    // Handle permission errors or other failures
    if (error instanceof Error) {
      throw new Error(`Failed to copy to clipboard: ${error.message}`);
    }
    throw new Error('Failed to copy to clipboard');
  }
}