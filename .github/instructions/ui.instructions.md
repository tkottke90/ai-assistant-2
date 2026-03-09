---
applyTo: 'frontend/**'
---

## General Guidelines

This frontend application uses **Preact** with **Signals** for state management, **TypeScript**, and **Tailwind CSS** for styling. Follow these principles when working with frontend code:

- Write testable, modular code—extract logic from components into pure functions
- Use Preact Signals (`useSignal`) for reactive state management
- Leverage shadcn/ui components from `@/components/ui/` for consistent UI
- Apply Tailwind utility classes for styling; include dark mode variants
- Type all props and state using TypeScript interfaces or types
- Handle errors gracefully with try-catch blocks and user-friendly messages
- Keep components focused on presentation; move business logic to utilities or hooks

## Component Design Patterns

### Avoid Nested Functions in Components

**Anti-pattern**: Do not define utility functions, event handlers, or data transformation functions inside component functions.

**Reason**: Nested functions cannot be unit tested independently without executing the entire component. This reduces testability and makes it difficult to test edge cases in isolation.

**Example of Anti-pattern**:
```tsx
export function AgentsPage() {
  const agents = useSignal<Agent[]>([]);
  
  // ❌ BAD: These functions are nested and untestable independently
  const paginatedAgents = () => {
    const start = (currentPage.value - 1) * itemsPerPage;
    return agents.value.slice(start, start + itemsPerPage);
  };

  const goToNextPage = () => {
    if (currentPage.value < totalPages.value) {
      currentPage.value += 1;
    }
  };

  return <div>{/* ... */}</div>;
}
```

**Correct approach**: Extract functions outside the component or into separate utility modules.

```tsx
// ✅ GOOD: Functions are testable independently
function paginateItems<T>(items: T[], page: number, itemsPerPage: number): T[] {
  const start = (page - 1) * itemsPerPage;
  return items.slice(start, start + itemsPerPage);
}

function canGoToNextPage(currentPage: number, totalPages: number): boolean {
  return currentPage < totalPages;
}

export function AgentsPage() {
  const agents = useSignal<Agent[]>([]);
  const currentPage = useSignal(1);
  
  const handleNextPage = () => {
    if (canGoToNextPage(currentPage.value, totalPages.value)) {
      currentPage.value += 1;
    }
  };

  return <div>{/* ... */}</div>;
}
```

**Exceptions**: Simple inline event handlers that only call other functions or set state are acceptable:
```tsx
// ✅ Acceptable: Simple inline handlers
<button onClick={() => setCount(count + 1)}>Increment</button>
<button onClick={() => deleteItem(id)}>Delete</button>
```

## Web Worker Pub/Sub Pattern

For cross-component state updates that need to reach components outside the current render tree (e.g. a sidebar rendered in a portal, or unrelated pages), use the **Web Worker as a pub/sub bus** rather than threading signals or callbacks through context.

### When to use this pattern

Use this pattern when:
- A user action in component A should trigger a data reload in component B with no shared ancestor
- The subscriber lives inside a `createPortal` (portals can lose React/Preact context)
- The update is a broadcast ("anyone who cares about X, reload it") rather than targeted prop passing

Do **not** use this pattern for:
- Parent→child communication (use props)
- Sibling communication with a shared parent (use a signal or context)
- Local UI state that doesn't involve the server

### Architecture

```
Publisher                     Worker                        Subscriber
──────────                    ──────                        ──────────
fireWorkerEvent(msg)  ──►  handles msg, fetches API  ──►  useWorkerEvent callback
                                                           updates local signal
```

The worker is a **singleton module** (`src/worker.ts?worker`), initialized once when `workerClient.ts` is first imported. It lives for the entire browser session, independent of route or component lifecycle.

### Adding a new pub/sub event

**1. Define types** in `src/lib/<domain>.ts`:
```ts
export const MY_EVT = 'my:event' as const;

export interface MyEventMessage {
  type: typeof MY_EVT;
  // ...any request payload fields
}

export type MyEventResponse = inferResponseEvents<typeof MY_EVT, MyResponseData>;
```

**2. Register in `src/lib/messages.ts`**:
```ts
export type InboundMessage = ... | MyEventMessage;
export type OutboundMessage = ... | MyEventResponse;
```

**3. Add a handler in `src/lib/<domain>.ts`**:
```ts
export async function myEventHandler(): Promise<MyEventResponse> {
  try {
    const data = await callApi();
    return { type: 'my:event:response', data };
  } catch (error) {
    return { type: 'my:event:error', error: String(error) };
  }
}
```

**4. Wire the case in `src/worker.ts`**:
```ts
case MY_EVT: {
  myEventHandler().then(emit);
  break;
}
```

**5. Publish** from any component using `fireWorkerEvent` (fire-and-forget):
```ts
import { fireWorkerEvent } from '@/lib/workerClient';
import { MY_EVT } from '@/lib/<domain>';

fireWorkerEvent({ type: MY_EVT });
```

**6. Subscribe** in the component that owns the data using `useWorkerEvent`:
```ts
import { useWorkerEvent } from '@/lib/workerClient';
import { MY_EVT } from '@/lib/<domain>';

const sendMyEvent = useWorkerEvent(MY_EVT, (e) => {
  myData.value = e.detail.data;
});

// Trigger initial load
useEffect(() => { sendMyEvent({}); }, []);
```

### `fireWorkerEvent` vs `useWorkerEvent`

| | `fireWorkerEvent` | `useWorkerEvent` |
|---|---|---|
| **Who uses it** | Publishers (trigger a reload) | Subscribers (own the response state) |
| **Hook required** | No — plain function, safe in portals | Yes — must be called inside a component |
| **Debounce** | None | Built-in (ignores if already loading) |
| **Returns** | `void` | `sendMessage` function |

### Real example: thread list refresh

```
ChatForm (submit)  ──► fireWorkerEvent({ type: 'refresh:threads' })
ThreadHeader       ──► fireWorkerEvent({ type: 'refresh:threads' })
AgentsPage         ──► fireWorkerEvent({ type: 'refresh:threads' })
                              │
                         worker.ts fetches /api/v1/chat/threads
                              │
                    emits 'refresh:threads:response'
                              │
                         ThreadList (useWorkerEvent)
                         updates threads.value & agentThreads.value
```

`ThreadList` is the single subscriber — it holds the authoritative local copy of the thread list. Any component that mutates thread state fires the event; `ThreadList` handles the reload regardless of where it is rendered in the DOM tree.

