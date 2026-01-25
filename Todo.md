# Todo List

# Base Infrastructure

- [X] Add Configuration System
  - [ ] Support environment variables
  - [X] Use YAML config
- [X] Add Logging System
  - [X] Store in file storage
  - [X] Auto Rotate
  - [X] Available via DI
- [X] Add file storage (probably `~/.config/ai-assistant` or something)
- [ ] Add SQLite Database with FTS5
- [ ] Install LangChain
  - [ ] Add Ollama integration
  - [ ] Add support for multiple LLM engines (Ollama, Anthropic, etc.)
- [ ] Add cli to start server (ex: `ai-assistant serve`)
- [ ] Add cli to trigger actions (ex: `ai-assistant run` to query agent)

# Agent Infrastructure

- [ ] Add Chat Endpoint
- [ ] Setup Memory
- [ ] Setup Knowledge Collection
- [ ] Setup agent task management