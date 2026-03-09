# Web Worker Pub/Sub Pattern

The app uses its Web Worker (`src/worker.ts`) as a lightweight **pub/sub bus** for cross-component data refresh. This lets any component trigger a reload (publisher) and any other component — even one rendered in a portal, on a different route, or with no shared ancestor — receive the updated data (subscriber).

---

## Why This Exists

The original approach threaded a `threadRefresh` counter signal through `AppContext` and passed callbacks as props. This broke when `ThreadList` was rendered inside `Drawer`, which uses `createPortal` to mount outside the main `#app` DOM node. Portals lose Preact context, so the signal was `undefined` at runtime.

The Worker is not part of the component tree, so it is immune to portal and context issues entirely.

---

## Mental Model

```
Publisher                          Worker                        Subscriber
──────────                         ──────                        ──────────
fireWorkerEvent({ type: 'X' })  ──►  fetches API / does work  ──►  useWorkerEvent('X', callback)
                                                                    updates local signal
```

- **Publishers** fire and forget — they don't care who is listening.
- The **worker** does the async work (API call, transform, etc.) and emits a response event.
- **Subscribers** own the local state and update it when the response arrives.

There can be many publishers and one subscriber per event type.

---

## Files Involved

| File | Role |
|---|---|
| `src/worker.ts` | Worker entry point — switch statement dispatching events to handlers |
| `src/lib/workerClient.ts` | Worker singleton, `fireWorkerEvent`, `useWorkerEvent` |
| `src/lib/messages.ts` | `InboundMessage` and `OutboundMessage` type unions |
| `src/lib/<domain>.ts` | Event constants, payload types, async handler functions |

---

## Adding a New Event

### 1. Define types and a handler in the domain file

```ts
// src/lib/chat.ts (or whichever domain file fits)

import { inferResponseEvents } from './utility-types';

export const MY_EVT = 'my:event' as const;

export interface MyEventMessage {
  type: typeof MY_EVT;
  // add any request payload fields here
}

export type MyEventResponse = inferResponseEvents<typeof MY_EVT, {
  items: Item[];
}>;

export async function myEventHandler(): Promise<MyEventResponse> {
  try {
    const data = await apiClient.getItems();
    return { type: 'my:event:response', data: { items: data } };
  } catch (err) {
    return { type: 'my:event:error', error: String(err) };
  }
}
```

`inferResponseEvents<TEvent, TData>` produces the `my:event:response` and `my:event:error` variants automatically.

### 2. Register in `src/lib/messages.ts`

```ts
// Add to InboundMessage union:
export type InboundMessage = ... | MyEventMessage;

// Add to OutboundMessage union:
export type OutboundMessage = ... | MyEventResponse;
```

### 3. Wire a case in `src/worker.ts`

```ts
import { MY_EVT, myEventHandler } from './lib/chat';

// Inside the switch:
case MY_EVT: {
  myEventHandler().then(emit);
  break;
}
```

### 4. Subscribe in the component that owns the state

```tsx
import { useWorkerEvent } from '@/lib/workerClient';
import { MY_EVT } from '@/lib/chat';
import { useEffect } from 'preact/hooks';

export function MyComponent() {
  const items = useSignal<Item[]>([]);

  const sendMyEvent = useWorkerEvent(MY_EVT, (e) => {
    items.value = e.detail.data.items;
  });

  // Trigger the initial load when the component mounts
  useEffect(() => { sendMyEvent({}); }, []);

  return <div>...</div>;
}
```

`useWorkerEvent` registers a response listener and returns a `sendMessage` function. It also includes built-in debounce — if a request is already in-flight, subsequent calls are ignored until the response arrives.

### 5. Publish from anywhere

```ts
import { fireWorkerEvent } from '@/lib/workerClient';
import { MY_EVT } from '@/lib/chat';

// In any component, callback, event handler — portals included:
fireWorkerEvent({ type: MY_EVT });
```

---

## `fireWorkerEvent` vs `useWorkerEvent`

| | `fireWorkerEvent` | `useWorkerEvent` |
|---|---|---|
| **Type** | Plain function | Hook (must be called inside a component) |
| **Use case** | Publisher — trigger a reload | Subscriber — receive and store the response |
| **Portal-safe** | Yes | Yes (listener registered via `EventTarget`, not context) |
| **Debounce** | None | Built-in — ignores if already loading |
| **Returns** | `void` | `sendMessage` trigger function |

---

## Real Example: Thread List Refresh

`REFRESH_THREADS_EVT` (`'refresh:threads'`) is the first event using this pattern.

**Publishers** — any component that mutates thread state:

```ts
// chat-form.tsx — after successfully sending a message
} finally {
  fireWorkerEvent({ type: REFRESH_THREADS_EVT });
}

// thread-header.tsx — after archive, delete, or summarize
fireWorkerEvent({ type: REFRESH_THREADS_EVT });

// agents/index.tsx — after starting or stopping an agent
fireWorkerEvent({ type: REFRESH_THREADS_EVT });
```

**Worker handler** (`src/lib/chat.ts` + `src/worker.ts`):

```ts
// chat.ts
export async function refreshThreads(): Promise<RefreshThreadsResponse> {
  const [threads, agentThreads] = await Promise.all([
    listThreads(),
    listAgentThreads(),
  ]);
  return { type: 'refresh:threads:response', data: { threads, agentThreads } };
}

// worker.ts
case REFRESH_THREADS_EVT: {
  refreshThreads().then(emit);
  break;
}
```

**Subscriber** (`src/components/thread-list.tsx`):

```ts
const sendRefresh = useWorkerEvent(REFRESH_THREADS_EVT, (e) => {
  threads.value = e.detail.data.threads;
  agentThreads.value = e.detail.data.agentThreads;
});

useEffect(() => { sendRefresh({}); }, []); // load on mount
```

`ThreadList` is the **single source of truth** for the local thread list. It renders correctly whether it's in the main tree or inside the mobile `Drawer` portal, because it never reads from context.

---

## Guidelines

- **One subscriber per event type.** If two components both need the data, have one subscribe and share via a module-level signal or a prop.
- **Keep handlers in the domain file** (`chat.ts`, `agents.ts`, etc.) — not in `worker.ts` itself. `worker.ts` is just the dispatch switch.
- **Handlers should always return both `response` and `error` variants.** Never throw from a worker handler — unhandled rejections in workers are silent.
- **Do not use this for local UI state.** A loading spinner, an open/close toggle, or form field state should stay in component signals.
