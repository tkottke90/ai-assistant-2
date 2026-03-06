# AI Assistant 2

A self-hosted AI assistant you run on your own computer or server. Chat with AI models you choose, create persistent agents that remember context over time, and connect external tools to extend what those agents can do — all without sending your data to a third-party service.

## What it does

**Chat** — Have threaded conversations with any AI model you have access to. Responses stream in as they're generated, and your conversation history is saved locally.

**Agents** — Create named AI agents with their own personality and instructions. Agents remember things across conversations, building up knowledge about you and your preferences over time.

**Tools** — Agents can be given access to external capabilities — such as browsing the web, managing files, or querying a database — through a standard called MCP (Model Context Protocol). If a tool supports MCP, you can connect it.

**Your models, your data** — AI Assistant 2 works with [Ollama](https://ollama.com) for fully local inference (nothing leaves your machine) as well as any OpenAI-compatible API. Your conversation history is stored in a local database file.

---

## What you need before starting

- **[Node.js](https://nodejs.org)** version 22 or higher — the runtime that powers the application
- **An AI model to talk to** — either:
  - [Ollama](https://ollama.com) installed and running locally (free, private), or
  - An API key for an OpenAI-compatible service

That's it.

---

## Setup

### 1. Get the code

```bash
git clone https://github.com/your-org/ai-assistant-2.git
cd ai-assistant-2
```

### 2. Install the application

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev
cd ..
```

This creates a local database file where your conversations and agent memory are stored.

### 4. Create your configuration file

```bash
cp config.example.yaml config/config.yaml
```

Open `config/config.yaml` in any text editor and fill in your LLM details (see [Configuring your AI model](#configuring-your-ai-model) below).

### 5. Start the application

Open two terminal windows:

```bash
# Window 1 — starts the backend server
cd backend && npm run dev
```

```bash
# Window 2 — starts the web interface
cd frontend && npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Configuring your AI model

The file `config/config.yaml` controls everything. The most important section is `llm`, where you tell the application where to find your AI model.

### Using Ollama (local)

If you have Ollama running on your machine with a model already pulled (e.g. `ollama pull qwen3:8b`):

```yaml
llm:
  apis:
    - alias: local
      provider: ollama
      defaultModel: qwen3:8b
      location: http://localhost:11434
      apiKey: ""
```

### Using an OpenAI-compatible API

```yaml
llm:
  apis:
    - alias: openai
      provider: openai
      defaultModel: gpt-4o
      location: https://api.openai.com/v1
      apiKey: "your-api-key-here"
```

You can add as many entries as you like under `apis` and switch between them in the chat interface. The `alias` is just a friendly name you'll see in the UI.

### Other settings

| Setting | What it does |
|---|---|
| `server.port` | The port the backend runs on (default: `6060`) |
| `logging.level` | How much detail to log: `error`, `warn`, `info`, or `debug` |
| `logging.toFile` | Whether to save logs to disk |
| `tools.mcp_servers` | External tools/capabilities to give your agents |

The full list of options with descriptions is in [config.example.yaml](config.example.yaml).

---

## License

[GNU GENERAL PUBLIC LICENSE](./LICENSE)