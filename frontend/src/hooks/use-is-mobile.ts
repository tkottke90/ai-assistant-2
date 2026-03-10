import { useComputed, useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

export function useIsMobile() {
  const currentSize = useSignal(window.innerWidth)
  const isMobile = useComputed(() => currentSize.value < 1024)

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      currentSize.value = window.innerWidth;
    });
    
    observer.observe(document.documentElement);
    
    return () => {
      observer.disconnect();
    };
  }, []);

  return isMobile;
}