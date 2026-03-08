import { useCallback, useRef } from "preact/hooks";

export function useScrollContainer<TElem extends HTMLElement>() {
  const containerRef = useRef<TElem>(null);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  return { containerRef, scrollToBottom };
}