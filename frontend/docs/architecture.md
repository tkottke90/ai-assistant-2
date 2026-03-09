# Frontend Architecture

## Stack

| Concern | Library |
|---|---|
| UI Framework | [Preact](https://preactjs.com/) (React-compatible, ~3 kB) |
| Routing | `preact-iso` (`LocationProvider` + `Router`) |
| Reactive State | `@preact/signals` (`useSignal`, `signal`, `computed`) |
| Styling | Tailwind CSS v4 |
| UI Primitives | [shadcn/ui](https://ui.shadcn.com/) (in `src/components/ui/`) |
| Build Tool | Vite |
| Language | TypeScript ~5.9 |
| Background Processing | [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) (`src/worker.ts`) |

---

## Folder Structure

```
src/
├── app.tsx              # Root component — mounts router and AppContextProvider
├── app-context.tsx      # AppContext definition and hook
├── main.tsx             # Entry point
├── worker.ts            # Web Worker — handles async tasks (API calls, etc.)
│
├── routes/
│   ├── chat/            # Main chat page (messages, form, thread header)
│   ├── agents/          # Agent management page
│   └── archive/         # Archived threads page
│
├── components/
│   ├── ui/              # shadcn/ui primitives (Button, Dialog, Input, etc.)
│   ├── layouts/         # Page layout shells (BaseLayout with sidebar)
│   ├── thread-list.tsx  # Sidebar thread list — subscriber for thread refresh
│   ├── drawer.tsx       # Mobile slide-out drawer (uses createPortal)
│   ├── dialog.tsx       # Modal dialog wrapper
│   ├── markdown.tsx     # Markdown renderer
│   └── llm-selector.tsx # LLM model picker dropdown
│
├── hooks/               # Custom Preact hooks
│   ├── use-api.ts
│   ├── use-agent-selection.ts
│   ├── use-llm-selection.ts
│   ├── use-scroll-container.ts
│   └── use-is-mobile.ts
│
└── lib/
    ├── chat.ts          # Chat domain types, API wrappers, worker handlers
    ├── messages.ts      # Worker message type unions (InboundMessage / OutboundMessage)
    ├── workerClient.ts  # Worker singleton + fireWorkerEvent + useWorkerEvent
    ├── agents.ts        # Agent domain helpers
    ├── utils.ts         # Shared utilities (createContextWithHook, cn, etc.)
    ├── date-utils.ts
    ├── html-utils.ts
    └── utility-types.ts
```

---

## Routing

Routes are declared in `app.tsx` using `preact-iso`:

```
/              → ChatPage
/chat          → ChatPage
/chat/:threadId → ChatPage (opens specific thread)
/agents        → AgentsPage
/archive       → ArchivePage
```

`useLocation()` from `preact-iso` gives you the current path and a `route()` function for programmatic navigation.

---

## State Management

The app uses **Preact Signals** for reactive state. Signals are observable values — any component that reads a signal's `.value` automatically re-renders when it changes.

```ts
const count = useSignal(0);            // local to a component
count.value++;                         // triggers re-render

const derived = computed(() => count.value * 2); // derived signal
```

**Module-level signals** (created outside components) persist across route changes. Use these for shared state that should survive navigation:

```ts
// lib/chat.ts — persists for the browser session
export const activeThreadId = signal<string | null>(null);
```

### AppContext

`AppContext` (defined in `app-context.tsx`) carries the small set of state that truly needs to cross route boundaries:

| Field | Type | Purpose |
|---|---|---|
| `threads` | `Signal<ThreadMetadata[]>` | The sidebar's thread list |
| `routeUpdate` | `EventTarget` | Broadcasts route-change events |

Access it from any component inside `AppContextProvider`:

```ts
import { useAppContext } from '@/app-context';
const { threads } = useAppContext();
```

> **Do not add things to AppContext** unless they genuinely need to be shared across routes. Prefer local signals, props, or the [Worker pub/sub pattern](./worker-pubsub.md) instead.

---

## Layouts

`BaseLayout` (`src/components/layouts/base.layout.tsx`) wraps every page. It renders a sidebar (with `ThreadList`) and the main content area. On mobile, the sidebar is accessible via a `Drawer` (rendered with `createPortal` into a `#dialogs` DOM node).

> **Note on portals**: The `Drawer` component renders outside the `#app` root using `createPortal`. This breaks Preact context — components inside a portal cannot read context values from ancestors in the component tree. This is why `ThreadList` uses the Worker pub/sub pattern rather than reading from context directly.

---

## API Communication

The frontend consumes the backend through `@tkottke90/ai-assistant-client`, a typed client library shared via a local npm package reference (`backend/src/lib/client/`).

**Chat streaming** uses HTTP chunked streaming over a `POST /api/v1/chat` request consumed via the `fetch()` `ReadableStream` API. The handler streams chunks as `data: <JSON>\n\n` and signals completion with `done: [DONE]\n\n`.

---

## Web Worker

All async work that needs to be decoupled from the render tree (fetching thread lists, etc.) goes through `src/worker.ts`. See [worker-pubsub.md](./worker-pubsub.md) for the full pattern.

The worker is a **singleton** — it is initialized once when `workerClient.ts` is first imported and lives for the entire browser session regardless of route changes or component unmounting.

---

## Error Handling

- Wrap async operations in `try/catch`
- Use `toast.error(message)` from `sonner` for user-visible errors
- The `<ErrorBoundary>` in `app.tsx` catches uncaught render errors and prevents full-page crashes
