# Configuration System - Quick Summary

## 🎯 Goal
Implement a flexible, type-safe configuration system for the AI Assistant application.

## 📍 Key Features

- **YAML-based**: Configuration stored at `~/.config/ai-assistant/config.yaml`
- **Type-safe**: Pydantic models for validation
- **Feature-organized**: Each feature (server, CORS, LLM) has its own config section
- **Dynamic loading**: Configs loaded when needed, not just at startup
- **API-driven**: Full CRUD operations via REST endpoints
- **Refresh support**: Explicit endpoint to reload after manual edits
- **Restart awareness**: System knows which changes require restart (via ClassVar metadata)
- **Clean separation**: Metadata (like `requires_restart`) kept in code, not in YAML files

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │ Controllers  │─────▶│ ConfigManager│                     │
│  │  (API)       │      │  (Singleton)  │                     │
│  └──────────────┘      └───────┬──────┘                     │
│                                 │                             │
│                        ┌────────▼────────┐                   │
│                        │  ConfigLoader   │                   │
│                        │  (YAML I/O)     │                   │
│                        └────────┬────────┘                   │
│                                 │                             │
│                        ┌────────▼────────┐                   │
│                        │  Pydantic Models│                   │
│                        │  (Validation)   │                   │
│                        └─────────────────┘                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ~/.config/ai-assistant/config.yaml
```

## 📁 File Structure

```
backend/src/config/
├── __init__.py
├── manager.py              # ConfigManager singleton
├── loader.py               # YAML file I/O
└── models/
    ├── __init__.py
    ├── base.py            # BaseConfig class
    ├── server.py          # ServerConfig
    ├── cors.py            # CorsConfig
    └── llm.py             # LLMConfig
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/config` | Get all configurations |
| GET | `/api/v1/config/{feature}` | Get specific feature config |
| PUT | `/api/v1/config/{feature}` | Update specific feature config |
| POST | `/api/v1/config/reset` | Reset all to defaults |
| POST | `/api/v1/config/refresh` | Reload all from disk |
| POST | `/api/v1/config/{feature}/refresh` | Reload specific feature from disk |
| GET | `/api/v1/config/schema` | Get JSON schema |

## 🔄 Workflows

### API Update (Automatic)
```
User → API → ConfigManager → YAML File + Cache → Active
```

### Manual Edit (Requires Refresh)
```
User → Edit YAML → Call Refresh API → ConfigManager → Cache → Active
```

## 📝 Example Config File

```yaml
server:
  host: 0.0.0.0
  port: 8000
  reload: true
  workers: 1

cors:
  allow_origins:
    - http://localhost:5173
  allow_credentials: true
  allow_methods: ["*"]
  allow_headers: ["*"]

llm:
  provider: ollama
  model: llama2
  temperature: 0.7
  max_tokens: 2048
  api_key: null
  base_url: http://localhost:11434
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Add to pyproject.toml
pyyaml>=6.0.1
```

### 2. Create Config Models
```python
# backend/src/config/models/base.py
from pydantic import BaseModel
from typing import ClassVar

class BaseConfig(BaseModel):
    """Base class for all configuration models"""
    requires_restart: ClassVar[bool] = False  # Metadata, not user data

    class Config:
        extra = "allow"
        use_enum_values = True

# backend/src/config/models/server.py
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class ServerConfig(BaseConfig):
    requires_restart: ClassVar[bool] = True  # Server changes need restart
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
```

**Note**: `requires_restart` is a `ClassVar` (class variable) rather than an instance field. This keeps it as metadata in the code, not user data in YAML files. Users cannot accidentally modify restart requirements, and YAML files stay clean and focused on configurable values only.

### 3. Use in Application
```python
# backend/src/main.py
from src.config.manager import ConfigManager

config_manager = ConfigManager()
server_config = config_manager.get_config("server")

uvicorn.run("src.server:app", host=server_config.host, port=server_config.port)
```

### 4. Use in Controllers
```python
from fastapi import Depends
from ...config.manager import get_config_manager

@router.get("/status")
def get_status(config_manager: ConfigManager = Depends(get_config_manager)):
    llm_config = config_manager.get_config("llm")
    return {"provider": llm_config.provider}
```

## ✅ Implementation Checklist

- [ ] Add pyyaml dependency
- [ ] Create config directory structure
- [ ] Implement BaseConfig and feature models
- [ ] Implement ConfigLoader
- [ ] Implement ConfigManager
- [ ] Create API endpoints
- [ ] Update main.py and server.py
- [ ] Write tests
- [ ] Update documentation

## 📚 Full Documentation

See [configuration-system-plan.md](./configuration-system-plan.md) for complete details.

