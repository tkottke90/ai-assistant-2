# AI Assistant 2 - Copilot Instructions

## Architecture Overview

**Full-stack application**: TypeScript/Vite frontend + Python/FastAPI backend sharing configuration semantics.

- **Frontend** (`frontend/`): Vite SPA with TypeScript
- **Backend** (`backend/`): FastAPI with dependency injection, configuration-driven
- **Config System** (`backend/src/config/`): Type-safe Pydantic models + YAML storage
- **Controllers** (`backend/src/controllers/v1/`): RESTful API endpoints (versioned)

Key insight: Configuration is the central contract—all services read from `ConfigManager` (singleton).

## Essential Developer Workflows

### Setup & Testing (use Makefile, not direct commands)
```bash
# The Makefile creates/uses a project virtualenv at `./.venv`.
make setup              # Frontend + backend dependencies (creates ./.venv)
make dev               # Backend dev server (uses ./.venv/python)
make test              # Run all tests (frontend Vitest + backend pytest)
make test-backend      # Backend only: pytest (uses ./.venv/bin/pytest)
make test-frontend     # Frontend only: npm test run
make compile           # Check Python syntax (py_compile) using venv
make clean             # Remove artifacts before CI/builds

# Run a single backend pytest node via make (works as a target):
# Example: run a single test function
make tests/logging/test_manager.py::TestLoggerManager::test_http_level_logs_correctly
```

**Config in dev**: Copy `config.example.yaml` to `config/config.yaml`, then `make dev` auto-loads it via `AI_ASSISTANT_CONFIG_DIR=../config` and uses the project virtualenv.

### Backend Testing Pattern
- Test files: `backend/tests/` with `test_*.py` naming
- Fixtures for shared setup, async tests use `pytest-asyncio`
- See `backend/tests/config/models/test_base.py` for config model testing

### Frontend Testing Pattern
- Test files colocated with source: `src/**/*.spec.ts`
- Vitest framework with `describe`/`it` blocks
- Coverage reports in `htmlcov/`

## Configuration System (Critical Pattern)

**Never hardcode service settings**—use `ConfigManager` singleton:

### In FastAPI endpoints (dependency injection)
```python
from src.config import ConfigManager, get_config_manager

@router.get("/example")
def endpoint(config_manager: ConfigManager = Depends(get_config_manager)):
    llm_cfg = config_manager.get_config("llm")  # Returns typed LLMConfig
    return {"model": llm_cfg.model, "provider": llm_cfg.provider}
```

### In services (direct instantiation)
```python
class MyService:
    def __init__(self):
        self.config_manager = ConfigManager()
    
    def get_client(self):
        cfg = self.config_manager.get_config("llm", reload=True)  # Always fresh
        if cfg.provider == "ollama":
            return OllamaClient(cfg.base_url, cfg.model)
```

### Adding new config fields
1. Create/update Pydantic model in `backend/src/config/models/<feature>.py` (inherits `BaseConfig`)
2. Register in `ConfigManager._config_models` dict
3. Set `requires_restart` ClassVar if server needs reload
4. Add field to `config.example.yaml` with comment

**Key**: Pydantic handles validation + defaults; `BaseConfig` auto-migrates deprecated fields.

## File Organization & Patterns

### Backend structure
- `src/main.py`: Entry point, reads server config, starts uvicorn
- `src/server.py`: FastAPI app setup, CORS/static middleware, startup validation
- `src/controllers/v1/`: Routers (`root.py`, `config.py`, etc.)
- `src/config/manager.py`: Singleton, thread-safe, caches loaded configs
- `src/config/models/`: Pydantic schemas (BaseConfig, ServerConfig, CorsConfig, LLMConfig)

### Frontend structure
- `frontend/src/`: TypeScript entry point + components
- `frontend/vitest.config.ts`: Test runner config
- `frontend/src/test/setup.ts`: Shared test utilities

## Cross-Component Communication

**Config propagation**: Server reads `config/config.yaml` → `ConfigManager` singleton → endpoint handlers + services access via `get_config("section_name")`.

**API versioning**: Router prefix `/api/v1` allows future v2 without breaking clients. New endpoints go in `controllers/v1/` subdirectories.

**CORS**: Dynamic, read from config on startup (no code restart needed). Modify `config.yaml` → restart server.

## Project-Specific Conventions

1. **Thread-safe singletons**: `ConfigManager` uses `RLock` (reentrant) for concurrent access—safe in async context
2. **Lazy loading**: Configs cached in memory; use `reload=True` if fresh data needed (e.g., after user updates via API)
3. **Deprecation handling**: Pydantic `@model_validator(mode='before')` auto-migrates old field names—backward compatible
4. **Error handling on startup**: `app.on_event("startup")` validates all configs; fails loudly if invalid YAML/schema
5. **Static files**: `/static/` mounted in `server.py` for HTML/CSS/JS

## Environment & Build

- **Python**: 3.10+ (ruff/black formatters configured)
- **Node**: v18+ (npm for frontend)
- **PyInstaller**: `make build` creates standalone executable at `backend/dist/ai-assistant-backend`
- **CI/CD**: Makefile targets align with GitHub Actions workflows

## Quick References

- **Config docs**: [backend/src/config/README.md](backend/src/config/README.md)
- **Example config**: [config.example.yaml](config.example.yaml)
- **Main README**: [README.md](README.md) for user workflows
- **Test coverage**: `make test` generates `htmlcov/index.html`
