# Todo List

# Base Infrastructure

- [ ] Add Configuration System
  - [ ] Support environment variables
  - [ ] Use YAML config
- [ ] Add Logging System
  - [ ] Store in file storage
  - [ ] Auto Rotate
  - [ ] Available via DI
- [ ] Add file storage (probably `~/.config/ai-assistant` or something)
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