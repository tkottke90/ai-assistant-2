import { batch, useSignal } from "@preact/signals";
import { useCallback } from "preact/hooks";

/**
 * Generic hook for calling an async API function with loading/error state management.
 * Returns reactive signals for the value, loading state, and error,
 * plus an `execute` function to trigger the call.
 */
export function useApi<T>(apiCall: () => Promise<T>) {
  const value = useSignal<T | null>(null);
  const loading = useSignal(false);
  const error = useSignal<Error | null>(null);

  const execute = useCallback(() => {
    loading.value = true;
    return apiCall()
      .then(result => {
        batch(() => {
          value.value = result;
          error.value = null;
        });
        return result;
      })
      .catch(err => {
        console.error('API call error:', err);
        error.value = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        loading.value = false;
      });
  }, [apiCall]);

  return { value, loading, error, execute };
}
