# AI Assistant Client Library

SDK for interacting with the AI Assistant API from browser or Node.js environments.

## Building

```bash
# Build once
npm run build

# Build and watch for changes
npm run dev

# Clean build artifacts
npm run clean
```

The build process uses esbuild to create both ESM and CommonJS outputs with TypeScript declarations.

## Installing in Frontend

### For Development (Recommended)

Use npm link to create a symlink - changes to the client library will automatically be available without reinstalling:

```bash
# In the client directory, create a global link
cd backend/src/lib/client
npm link

# In the frontend directory, link to it
cd ../../../../frontend
npm link @tkottke90/ai-assistant-client
```

Then start the client library watcher in one terminal:
```bash
cd backend/src/lib/client
npm run dev
```

And your frontend dev server in another. Changes to the client will be picked up automatically!

### For Production

Install as a local package:

```bash
cd frontend
npm install ../backend/src/lib/client
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "@tkottke90/ai-assistant-client": "file:../backend/src/lib/client"
  }
}
```

## Usage

### Using Pre-built Methods

```typescript
import { getServerInfo } from '@tkottke90/ai-assistant-client';

const info = await getServerInfo({});
console.log(info.version, info.name);
```

### Creating Custom Client Methods

```typescript
import { createClientMethod } from '@tkottke90/ai-assistant-client';
import { z } from 'zod';

// Define input schema
const CreateUserInput = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Define output schema
const UserOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

// Create client method with async output processor
const createUser = createClientMethod(
  '/api/users',
  { 
    method: 'post',
    inputSchema: CreateUserInput 
  },
  async (response) => {
    const data = await response.json();
    return UserOutput.parse(data);
  }
);

// Use it
const user = await createUser({ 
  name: 'John Doe', 
  email: 'john@example.com' 
});

console.log(user.id); // Fully typed!
```

### Without Output Processor

If you don't provide an output processor, the method returns the raw `Response` object:

```typescript
const fetchRaw = createClientMethod(
  '/api/data',
  { method: 'get' }
);

const response = await fetchRaw({});
const text = await response.text();
```

## API

### `createClientMethod(path, options, outputProcessor?)`

Creates a type-safe HTTP client method.

**Parameters:**
- `path` (string): API endpoint path
- `options` (object):
  - `method`: HTTP method ('get' | 'post' | 'put' | 'delete' | 'patch')
  - `inputSchema?`: Zod schema for request body validation
  - `acceptedTypes?`: Array of accepted content types
- `outputProcessor?` (function): Optional function to process the response
  - Signature: `(response: Response) => T | Promise<T>`
  - When provided, the return type will be `Promise<T>`
  - When omitted, the return type will be `Promise<Response>`

**Returns:** A function that accepts input and optional RequestInit, returns a Promise

### `HttpError`

Error class thrown when HTTP requests fail.

```typescript
import { HttpError } from '@tkottke90/ai-assistant-client';

try {
  await someRequest({});
} catch (error) {
  if (error instanceof HttpError) {
    console.error('HTTP Error:', error.status, error.message);
  }
}
```

## Development

The library is built with:
- **esbuild**: Fast bundling for ESM and CJS formats
- **TypeScript**: Type declarations for full IntelliSense support
- **Zod**: Runtime schema validation

## Output Formats

- `dist/index.js` - ESM module
- `dist/index.cjs` - CommonJS module
- `dist/index.d.ts` - TypeScript declarations
- `dist/*.map` - Source maps for debugging
