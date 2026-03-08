import type { Signal } from "@preact/signals";
import { createContextWithHook } from "./lib/utils";
import type { ThreadMetadata } from "@tkottke90/ai-assistant-client";

// Custom event — pass your event map as TMap
export interface RouterEventMap {
  'route-updated': CustomEvent<string>;
}

const {
  Provider: AppContextProvider,
  useHook: useAppContext,
} = createContextWithHook<{
  threads: Signal<ThreadMetadata[]>;
  routeUpdate: EventTarget;
  threadRefresh: Signal<number>;
}>();

export { AppContextProvider, useAppContext };