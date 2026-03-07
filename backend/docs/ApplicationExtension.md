# Express Application Extension

This document describes the strategy used to extend the Express `Application` and `Request` types with custom services, and how to add a new service following the same pattern.

---

## The Problem

Express's built-in `Application` type does not know about application-specific services such as loggers, LLM clients, or agent managers. Without augmentation, attaching a property like `app.logger` compiles without type information, which means:

- TypeScript cannot verify that the property exists before use.
- Editor tooling provides no autocomplete or inline documentation for the property.
- There is no single canonical description of what the application object carries at runtime.

The same problem applies to the `Request` type: middleware may attach properties to `req` that downstream handlers need to access.

---

## The Solution: Declaration Merging

TypeScript supports **declaration merging** for interfaces inside `declare global` blocks. Express ships its `Application` and `Request` types as interfaces inside the `Express` namespace, which makes them open to extension from anywhere in the codebase.

All application-level augmentations live in a single file: `src/lib/types/application.ts`. This file contains one `declare global` block that merges additional properties into both `Express.Application` and `Express.Request`. Because TypeScript merges all declarations of the same interface, any file that imports from this module (or from a file that transitively imports it) gains the extended types project-wide.

The file also re-exports `express.Request`, `express.Response`, and `express.Application` as named types for convenience, so the rest of the codebase can import from a single location rather than directly from the `express` package.

---

## Anatomy of a Service Entry

Each service on the application object follows the same structure inside the `Express.Application` interface:

**Property name** — a short, lowercase identifier that matches exactly what is assigned to `app` at runtime (e.g. `app.logger = ...`). This is what handlers access via `req.app.logger`.

**Property type** — the TypeScript class or interface exported by the service's own module. Only the class type is imported here (using `import type` where possible to avoid circular dependency issues). The property type should be the concrete class rather than a generic interface so that the full public API of the service is visible to consumers.

**JSDoc comment** — a brief description of what the service does and any caveats about its lifecycle (e.g. "not available until after the async init phase completes"). This comment surfaces in editor hover documentation wherever the property is accessed.

The `config` service is the one exception to the "class type" rule: it is typed as an inline object with explicit method signatures rather than a class type. This is intentional — `config` is a plain object literal constructed at startup rather than a class instance, so its public contract is described directly where readers of this file expect to find it.

---

## Lifecycle and the Request Augmentation

The `Request` interface is extended separately in the same `declare global` block. Currently it carries a single property: `req.logger`, a per-request child Winston logger attached by `HttpEventMiddleware` early in the middleware stack.

Any property added to `Express.Request` is expected to be set by middleware before route handlers run. If a property is set by a later step in the pipeline, that dependency should be documented clearly or enforced by middleware ordering.

---

## How to Add a New Service

Adding a new service requires three steps.

### 1. Add the property to `application.ts`

Open `src/lib/types/application.ts` and add a new property to the `Express.Application` interface block. Import the service class at the top of the file using `import type` to keep the dependency cycle-safe. Write a JSDoc comment describing the service and any relevant lifecycle notes.

If the service is a plain object (like `config`) rather than a class instance, define the type inline as an object type with explicit method signatures.

### 2. Write a setup function

By convention, each service lives in its own module under `src/lib/` and exports a default `setup<ServiceName>(app)` function that:

- Reads any required configuration from `app.config`.
- Constructs the service instance, passing a child logger (`app.logger.child({ location: '<ServiceName>' })`) for scoped log output.
- Assigns the instance to `app.<propertyName>`.

If the setup is asynchronous, the function should return a `Promise<void>`. This signals to `app.ts` that it must be awaited or chained before dependent services are initialized.

### 3. Register the setup call in `app.ts`

Call the setup function at the appropriate point in `app.ts`:

- **Synchronous or fast services** that must be available before any request is handled should be called directly at the module level, in order of their dependencies. Config, logger, and LLM manager follow this pattern.
- **Slow or optional services** that may take time to initialize (network connections, database scans) should be chained into the fire-and-forget async block below the server bind. Tool manager and agent manager follow this pattern. Be aware that these services will be unavailable for a brief window at startup and that any unhandled rejection in the chain will trigger a graceful shutdown.

If the new service depends on an existing service (e.g. it needs `app.tools`), its setup call must come after the setup call for that dependency. Because TypeScript does not enforce call ordering at compile time, this constraint is documented solely through ordering in `app.ts` and comments.

---

## Current Service Registry

| Property | Type | Initialized | Notes |
|---|---|---|---|
| `app.config` | inline object | [Synchronous, first](../src/lib/config.ts#L134) | Required by all other services |
| `app.logger` | `winston.Logger` | [Synchronous, second](../src/lib/logger.ts#L55) | Requires `config` |
| `app.llm` | `LLMManager` | [Synchronous, third](../src/lib/llm/index.ts#L140) | Requires `config`, `logger` |
| `app.dbHealth` | `DbHealthMonitor` | [Synchronous (probe is async)](../src/app.ts#L33) | Requires `logger`; polls every 15 s |
| `app.tools` | `ToolManager` | [Async](../src/lib/tools/manager.ts#L161) | Requires `config`, `logger`, `llm` |
| `app.agents` | `AgentManager` | [Async, after tools](../src/lib/agents/index.ts#L9) | Requires `logger`, `llm`, `tools` |
| `app.shutdown` | `(code?) => void` | [Set by `setupShutdown()` after server bind](../src/lib/shutdown.ts#L12) | Requires the `Server` instance |
| `req.logger` | `winston.Logger` | [Per-request, by `HttpEventMiddleware`](../src/middleware/http.middleware.ts#L16) | Child of `app.logger` scoped to the request |
