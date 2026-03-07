# AI Assistant 2 - Copilot Instructions

## Architecture Overview

**Full-stack application**: Preact/Vite frontend + TypeScript/Express backend with a shared client library.

- **Frontend** (`frontend/`): Vite SPA using Preact, Signals, Tailwind CSS, and shadcn/ui
- **Backend** (`backend/`): Express 5 with TypeScript, configuration-driven, services attached to the `app` instance
- **Config System** (`backend/src/lib/config/`): Zod schemas + YAML file storage
- **Database** (`backend/prisma/`): Prisma ORM with SQLite; LangGraph checkpointer for agent state
- **Agents** (`backend/src/lib/agents/`): LangChain/LangGraph agent runtime with persistent memory
- **LLM** (`backend/src/lib/llm/`): Multi-provider LLM manager (Ollama + OpenAI) via LangChain
- **Client Library** (`backend/src/lib/client/`): Typed API client shared with the frontend via a local package reference
- **Controllers** (`backend/src/controllers/v1/`): Versioned RESTful API endpoints

Key insight: Core services (`config`, `logger`, `llm`, `agents`) are initialised once at startup and attached directly to the Express `app` instance, making them accessible as `req.app.config`, `req.app.logger`, `req.app.llm`, and `req.app.agents` in every handler.

## Essential Developer Workflows

### Running in development

Each app is run independently with `npm run dev`:

```bash
# Backend (from backend/)
npm run dev
# Equivalent to: DATABASE_URL='file:../config/data/dev.db' CONFIG_DIR='../config' tsx watch src/index.ts

# Frontend (from frontend/)
npm run dev
# Equivalent to: vite
```

**Config in dev**: The backend reads from `CONFIG_DIR` (defaults to `~/config/ai-assistant`). For local development, set `CONFIG_DIR=../config` (already wired into `npm run dev`). The `config/config.yaml` file is auto-created with defaults on first run if it doesn't exist.

### Building

```bash
# Backend
cd backend && npm run build   # tsc → dist/

# Frontend
cd frontend && npm run build  # tsc -b && vite build → dist/
```

### Database (Prisma)

```bash
cd backend
npx prisma migrate dev        # Run pending migrations
npx prisma generate           # Regenerate Prisma client after schema changes
```

The generated Prisma client is output to `backend/src/lib/prisma/` (not `node_modules`).
<<<<<<< HEAD
=======

> **⚠️ FTS Tables Warning**: The SQLite full-text search tables (`memory_fts`, `memory_fts_config`, `memory_fts_data`, `memory_fts_docsize`, `memory_fts_idx`) are created by a raw SQL migration and are **not represented in `schema.prisma`**. Prisma does not know about them and will warn that it is about to drop them every time you run `prisma migrate dev`. **Always review migration warnings before confirming** — if you see these FTS tables listed for deletion, that is expected and safe to confirm, but never allow a migration to drop them in production without explicit intent to remove the memory search feature.
>>>>>>> main

## Configuration System (Critical Pattern)

Config is loaded from `config/config.yaml`, validated against Zod schemas, and attached to the Express `app` object. The `app.config` object provides typed getters:

```typescript
// In a route handler
const port = req.app.config.get('server.port', '3000');
const portNum = req.app.config.getNumber('server.port', 3000);
```

### Schema location

Zod schemas live in `backend/src/lib/config/`:
- `config.schema.ts` — root schema composing all sections
- `server.schema.ts` — `ServerConfigSchema` (host, port, CORS)
- `llm.schema.ts` — `LlmConfigSchema` (array of named LLM API configs)
- `logging.schema.ts` — `LoggingSchema`

### Adding new config fields

1. Add the Zod field (with `.default()`) to the appropriate schema file
2. Compose it into `config.schema.ts` if it's a new top-level section
3. Add the field to `config.example.yaml` with a comment
4. Access it via `app.config.get('section.field')` at runtime

**Key**: Zod handles validation and defaults. On startup, `lib/config.ts` deep-merges loaded YAML with Zod defaults and writes back any missing sections, keeping the config file self-healing.

## LLM Manager

`LLMManager` lives at `app.llm` and wraps LangChain chat models:

```typescript
// Get a client by alias (falls back to default if no alias provided)
const llm = req.app.llm.getClient('local-ollama');

// Override the model for a single call
const llm = req.app.llm.getClientWithModel('local-ollama', 'llama3:8b');
```

LLM providers are configured in `config.yaml` under `llm.apis[]`. Each entry has `alias`, `provider` (`ollama` | `openai`), `defaultModel`, `location`, and optional `apiKey`.

## Agent System

`AgentManager` lives at `app.agents` and manages `AgentRuntime` instances:

- Agents are loaded from the database at startup and optionally auto-started (`auto_start` flag)
- `AgentRuntime` wraps a LangGraph agent with a persistent SQLite checkpointer, a system prompt, and memory tools
- The `Queue<T>` type in `lib/types/` supports message buffering for agents

```typescript
const agentManager = req.app.agents;
const runtime = agentManager.getAgent(agentId);   // → AgentRuntime | undefined
const isActive = agentManager.isActive(agentId);  // → boolean
const agent = runtime.getAgent(abortSignal);       // → LangGraph compiled agent
```

## DAO Pattern

Database access goes through Data Access Objects in `backend/src/lib/dao/`:
- `agent.dao.ts` — CRUD for agents
- `thread.dao.ts` — thread management
- `memory.dao.ts` — agent memory (full-text search enabled via FTS migration)
- `chat.dao.ts` — chat history

All DAOs use the shared `prisma` client instance exported from `lib/database.ts`.

## File Organization & Patterns

### Backend structure
- `src/index.ts` — entry point; calls `startApp`
- `src/app.ts` — Express app setup: initialises config, logger, LLMs, agents, middleware, controllers
- `src/lib/config.ts` — loads and validates YAML config, attaches to `app`
- `src/lib/llm/index.ts` — `LLMManager` class; `lib/llm/ollama.ts` and `openai.ts` for provider factories
- `src/lib/agents/` — `AgentManager`, `AgentRuntime`, `memory-prompt.ts`
- `src/lib/dao/` — Prisma-based DAOs
- `src/lib/models/` — Zod schemas / TypeScript types for domain objects
- `src/lib/errors/` — typed HTTP error classes (`HttpError`, `NotFoundError`, etc.)
- `src/lib/tools/` — LangChain tools (e.g., `memory-tools.ts`)
- `src/controllers/index.ts` — mounts `/api` router, includes health check at `/api/health`
- `src/controllers/v1/` — versioned routers: `agents.ts`, `chat.ts`, `config.ts`, `llm.ts`, `assets.ts`
- `src/middleware/` — `error.middleware.ts`, `http.middleware.ts`, `zod.middleware.ts`

### Frontend structure
- `frontend/src/app.tsx` — root component with `preact-iso` `Router`
- `frontend/src/routes/chat/` — chat page, messages, form, history
- `frontend/src/routes/agents/` — agents management page
- `frontend/src/components/` — shared components (`dialog`, `drawer`, `markdown`, `thread-list`, etc.)
- `frontend/src/components/ui/` — shadcn/ui primitives
- `frontend/src/hooks/` — custom hooks (`use-api`, `use-llm-selection`, `use-agent-selection`, etc.)
- `frontend/src/lib/` — utilities (`date-utils`, `html-utils`, `utils`)

## Cross-Component Communication

**Chat streaming**: `POST /api/v1/chat` responds with Server-Sent Events (`text/event-stream`). Each chunk is `data: <JSON>\n\n`; completion is signalled with `done: [DONE]\n\n`.

**API versioning**: All versioned routes are under `/api/v1`. New routes go in `controllers/v1/`.

**Client library**: `backend/src/lib/client/` is published as a local npm package (`@tkottke90/ai-assistant-client`) and consumed directly by the frontend. Keep types in this library in sync when changing API contracts.

## Error Handling

Throw typed errors from `lib/errors/http.errors.ts` (e.g., `NotFoundError`, `BadRequestError`). The `errorHandler` middleware in `middleware/error.middleware.ts` converts them to the correct HTTP status and JSON body. Non-`HttpError` instances become generic 500 responses.

## Request Validation

Use Zod middleware helpers from `middleware/zod.middleware.ts`:
- `ZodBodyValidator(schema)` — validates `req.body`, stores result in `req.body`
- `ZodParamValidator(schema)` — validates `req.params`
- `ZodQueryValidator(schema)` — validates `req.query`, stores result in `res.locals.query`

## Project-Specific Conventions

1. **Services on `app`**: `app.config`, `app.logger`, `app.llm`, `app.agents` are set during startup. Extend `express.Application` in `src/lib/types/` if adding new service properties.
2. **Child loggers**: Use `req.logger` in route handlers (set by HTTP middleware). Create child loggers via `app.logger.child({ location: 'MyService' })` for services.
3. **LangGraph checkpointer**: The shared `checkpointer` from `lib/database.ts` uses the same SQLite file as Prisma. Do not create additional checkpointer instances.
4. **Pagination**: Use `PaginationQuerySchemaBase` and `PaginationQuery` from `lib/types/pagination.ts` for list endpoints.
5. **Static files**: The frontend build is served by `controllers/static.ts` in production.

## Environment & Build

<<<<<<< HEAD
- **Node**: 18+ (tsx for dev, tsc for prod build)
=======
- **Node**: 22+ (tsx for dev, tsc for prod build)
>>>>>>> main
- **TypeScript**: ~5.9 across backend and frontend
- **Database**: SQLite via Prisma + `@prisma/adapter-better-sqlite3`; set `DATABASE_URL=file:<path>` before running
- **Config dir**: Set `CONFIG_DIR=<path>` before running the backend; defaults to `~/config/ai-assistant`

## Quick References

- **Example config**: [config.example.yaml](config.example.yaml)
- **Prisma schema**: [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- **Main README**: [README.md](README.md)
- **Agent memory design**: [docs/agent-memory-system.md](docs/agent-memory-system.md)
