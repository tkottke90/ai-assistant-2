# Configuration System

A robust, type-safe configuration management system for the AI Assistant application.

## 📋 Overview

The configuration system provides:
- **Type-safe** configuration using Pydantic models
- **YAML-based** storage for easy manual editing
- **Runtime updates** via REST API
- **Restart awareness** - knows which changes require application restart
- **Thread-safe** operations for concurrent access
- **Lazy loading** - configurations loaded when needed
- **Environment override** - customize config location per environment

## 🗂️ Configuration Location

By default, configuration is stored at:
- **Unix/Linux/macOS**: `~/.config/ai-assistant/config.yaml`
- **Windows**: `%USERPROFILE%\.config\ai-assistant\config.yaml`

### Override Config Directory

Set the `AI_ASSISTANT_CONFIG_DIR` environment variable to use a custom location:

```bash
# Development - keep config in repo
export AI_ASSISTANT_CONFIG_DIR=./config

# Docker - use container-specific location
export AI_ASSISTANT_CONFIG_DIR=/etc/ai-assistant

# Absolute path
export AI_ASSISTANT_CONFIG_DIR=/var/lib/ai-assistant/config
```

Relative paths are resolved from the current working directory.

## 🚀 Quick Start

### 1. Accessing ConfigManager in Dependency Injection

Use the `get_config_manager()` dependency function in your FastAPI endpoints:

```python
from fastapi import APIRouter, Depends
from src.config import ConfigManager, get_config_manager

router = APIRouter()

@router.get("/example")
def my_endpoint(config_manager: ConfigManager = Depends(get_config_manager)):
    # Get LLM configuration
    llm_config = config_manager.get_config("llm")
    
    # Use the config
    provider = llm_config.provider
    model = llm_config.model
    
    return {"provider": provider, "model": model}
```

### 2. Using ConfigManager in Services

For non-FastAPI code (services, utilities), directly instantiate ConfigManager:

```python
from src.config import ConfigManager

class LLMService:
    def __init__(self):
        self.config_manager = ConfigManager()
    
    def get_client(self):
        # Always get fresh config (reload=True)
        llm_config = self.config_manager.get_config("llm", reload=True)
        
        if llm_config.provider == "ollama":
            return self._create_ollama_client(llm_config)
        elif llm_config.provider == "anthropic":
            return self._create_anthropic_client(llm_config)
```

### 3. Getting the Config File Path

```python
config_manager = ConfigManager()
config_path = config_manager.get_config_path()
print(f"Config file: {config_path}")
# Output: Config file: /home/user/.config/ai-assistant/config.yaml
```

## 📝 Adding New Configuration Fields

### To an Existing Feature

1. **Update the Pydantic model** in `models/<feature>.py`:

```python
# models/llm.py
from typing import Optional, Literal
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class LLMConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False
    
    provider: Literal["ollama", "anthropic", "openai"] = Field(
        default="ollama", description="LLM provider to use"
    )
    model: str = Field(default="llama2", description="Model name")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1)
    
    # NEW FIELD - Add with default value
    timeout: int = Field(default=30, ge=1, description="Request timeout in seconds")
```

2. **That's it!** The configuration system will:
   - ✅ Automatically validate the new field
   - ✅ Use the default value if not in YAML
   - ✅ Include it in API responses
   - ✅ Add it to the JSON schema

3. **Update existing config files** (optional):

```yaml
# ~/.config/ai-assistant/config.yaml
llm:
  provider: ollama
  model: llama2
  temperature: 0.7
  max_tokens: 2048
  timeout: 60  # NEW FIELD
```

## 🆕 Adding a New Feature

### Step 1: Create the Pydantic Model

Create a new file in `models/<feature>.py`:

```python
# models/database.py
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar, Optional

class DatabaseConfig(BaseConfig):
    # Set to True if changes require restart
    requires_restart: ClassVar[bool] = True
    
    host: str = Field(default="localhost", description="Database host")
    port: int = Field(default=5432, ge=1, le=65535, description="Database port")
    database: str = Field(default="ai_assistant", description="Database name")
    username: str = Field(default="postgres", description="Database username")
    password: Optional[str] = Field(default=None, description="Database password")
    pool_size: int = Field(default=10, ge=1, description="Connection pool size")
```

### Step 2: Export the Model

Add to `models/__init__.py`:

```python
from .base import BaseConfig
from .server import ServerConfig
from .cors import CorsConfig
from .llm import LLMConfig
from .database import DatabaseConfig  # NEW

__all__ = [
    "BaseConfig",
    "ServerConfig", 
    "CorsConfig",
    "LLMConfig",
    "DatabaseConfig",  # NEW
]
```

### Step 3: Register in ConfigManager

Update `manager.py` to include the new feature:

```python
# manager.py
from .models import BaseConfig, ServerConfig, CorsConfig, LLMConfig, DatabaseConfig

class ConfigManager:
    # ... existing code ...

    def __init__(self) -> None:
        # ... existing code ...

        # Configuration models registry
        self._config_models: Dict[str, Type[BaseConfig]] = {
            "server": ServerConfig,
            "cors": CorsConfig,
            "llm": LLMConfig,
            "database": DatabaseConfig,  # NEW
        }
```

### Step 4: Use the New Configuration

```python
from src.config import ConfigManager, get_config_manager

# In a FastAPI endpoint
@router.get("/db-status")
def check_database(config_manager: ConfigManager = Depends(get_config_manager)):
    db_config = config_manager.get_config("database")

    return {
        "host": db_config.host,
        "port": db_config.port,
        "database": db_config.database,
        "pool_size": db_config.pool_size
    }
```

### Step 5: YAML Configuration

The new feature will automatically appear in the config file:

```yaml
# ~/.config/ai-assistant/config.yaml
server:
  host: 0.0.0.0
  port: 8000
  reload: true
  workers: 1

cors:
  allow_origins:
    - http://localhost:5173
  allow_credentials: true
  allow_methods:
    - "*"
  allow_headers:
    - "*"

llm:
  provider: ollama
  model: llama2
  temperature: 0.7
  max_tokens: 2048

database:  # NEW FEATURE
  host: localhost
  port: 5432
  database: ai_assistant
  username: postgres
  password: secret123
  pool_size: 20
```

## 🔄 Configuration Workflows

### API-Based Updates (Recommended)

Changes made via API are automatically saved and cached:

```bash
# Update LLM configuration
curl -X PUT http://localhost:8000/api/v1/config/llm \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "temperature": 0.5,
      "max_tokens": 4096
    }
  }'
```

### Manual File Edits + Refresh

1. Edit `~/.config/ai-assistant/config.yaml` manually
2. Call the refresh endpoint:

```bash
# Refresh all configurations
curl -X POST http://localhost:8000/api/v1/config/refresh

# Refresh specific feature
curl -X POST http://localhost:8000/api/v1/config/llm/refresh
```

## 📚 Available API Endpoints

- `GET /api/v1/config` - Get all configurations
- `GET /api/v1/config/{feature}` - Get specific feature config
- `PUT /api/v1/config/{feature}` - Update specific feature config
- `POST /api/v1/config/reset` - Reset all configs to defaults
- `POST /api/v1/config/refresh` - Reload all configs from disk
- `POST /api/v1/config/{feature}/refresh` - Reload specific feature from disk
- `GET /api/v1/config/schema` - Get JSON schema for all configs

## 🔒 Restart Requirements

Some configuration changes require an application restart:

- **Server config** (`requires_restart: True`) - host, port, workers
- **CORS config** (`requires_restart: False`) - can be updated at runtime
- **LLM config** (`requires_restart: False`) - can be updated at runtime

The API will indicate if a restart is required:

```json
{
  "feature": "server",
  "config": { "host": "0.0.0.0", "port": 9000 },
  "requires_restart": true
}
```

## 🧵 Thread Safety

All ConfigManager operations are thread-safe using `RLock`:
- Multiple threads can safely read configurations
- Updates are atomic and properly synchronized
- Cache invalidation is thread-safe

## 🎯 Best Practices

1. **Use dependency injection** in FastAPI endpoints
2. **Reload when needed** - Use `reload=True` for frequently changing configs
3. **Set appropriate defaults** - Always provide sensible defaults in models
4. **Document fields** - Use `Field(description=...)` for clarity
5. **Validate inputs** - Use Pydantic validators (ge, le, regex, etc.)
6. **Mark restart requirements** - Set `requires_restart` ClassVar appropriately
7. **Use environment variables** - Override config directory for different environments

## 📖 Example: Complete Feature Addition

See the full example in `docs/configuration-system-plan.md` for detailed implementation guidance.

## 🐛 Troubleshooting

### Config file not found
The system creates the config file automatically with defaults on first use.

### Permission denied
Ensure the application has write permissions to the config directory.

### Invalid YAML
Check YAML syntax. The system will raise validation errors on startup.

### Changes not taking effect
- For runtime configs: Call the refresh endpoint
- For restart-required configs: Restart the application

## 🔄 Field Deprecation and Migration

The configuration system supports graceful field deprecation with automatic migration.

### Deprecating a Field

When you need to rename or remove a field, use Pydantic's `deprecated` parameter:

#### **Option 1: Deprecate with Replacement (Recommended)**

```python
from typing import Optional
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class LLMConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False

    # NEW FIELD (preferred)
    api_base_url: Optional[str] = Field(
        default="http://localhost:11434",
        description="Base URL for API endpoint"
    )

    # DEPRECATED FIELD (backward compatible)
    base_url: Optional[str] = Field(
        default=None,
        deprecated=True,
        json_schema_extra={
            "deprecated_since": "v2.1.0",
            "removed_in": "v3.0.0",
            "replacement": "api_base_url"
        },
        description="DEPRECATED: Use 'api_base_url' instead"
    )
```

**What happens:**
- Old configs with `base_url` automatically migrate to `api_base_url`
- Users see clear migration warnings
- No breaking changes - old configs continue to work

**Console output:**
```
⚠️  Migrated deprecated field 'base_url' -> 'api_base_url'
   Deprecated since: v2.1.0, will be removed in: v3.0.0
   Please update your config file to use 'api_base_url'
```

#### **Option 2: Deprecate without Replacement**

For fields being removed entirely:

```python
class ServerConfig(BaseConfig):
    requires_restart: ClassVar[bool] = True

    # Field being removed (no replacement)
    legacy_setting: Optional[bool] = Field(
        default=None,
        deprecated=True,
        json_schema_extra={
            "deprecated_since": "v2.0.0",
            "removed_in": "v3.0.0"
            # No 'replacement' key
        },
        description="DEPRECATED: This setting will be removed"
    )
```

**What happens:**
- Field still works (backward compatible)
- Warning logged when used
- No automatic migration

**Console output:**
```
⚠️  Using deprecated field 'legacy_setting'
   Deprecated since: v2.0.0, will be removed in: v3.0.0
   No replacement available - this field will be removed entirely
```

### Deprecation Lifecycle

**Phase 1: Add New Field (v2.0.0)**
```python
# Add new field with better name
api_base_url: str = Field(default="http://localhost:11434")
```

**Phase 2: Deprecate Old Field (v2.1.0)**
```python
# Keep old field, mark as deprecated
base_url: Optional[str] = Field(
    default=None,
    deprecated=True,
    json_schema_extra={
        "deprecated_since": "v2.1.0",
        "removed_in": "v3.0.0",
        "replacement": "api_base_url"
    }
)
```

**Phase 3: Support Both (v2.1.0 - v2.9.0)**
- Users see warnings
- Configs auto-migrate
- No breaking changes

**Phase 4: Remove Deprecated Field (v3.0.0)**
```python
# Simply remove the deprecated field
# Old configs will show "orphaned field" warnings
```

### Startup Deprecation Report

On application startup, all deprecated fields in use are reported:

```
======================================================================
DEPRECATION WARNINGS
======================================================================

⚠️  Deprecated fields detected in 'llm' configuration:
   • 'base_url' → use 'api_base_url' instead
     Deprecated since: v2.1.0, Removed in: v3.0.0
   Config file: /path/to/config.yaml

======================================================================
```

### Migration Behavior

The `BaseConfig` class automatically handles migration:

1. **Checks for deprecated fields** in the raw YAML data
2. **If replacement exists:**
   - Migrates value to new field
   - Removes deprecated field from data
   - Logs migration warning
3. **If no replacement:**
   - Keeps field functional
   - Logs deprecation warning
4. **If both old and new exist:**
   - Uses new field value
   - Logs conflict warning

### Testing Deprecated Fields

See `backend/tests/config/models/test_base.py` for comprehensive examples of testing deprecated fields.

## 📦 Dependencies

- `pyyaml>=6.0.1` - YAML parsing
- `pydantic>=2.5.0` - Data validation and models
- `fastapi>=0.109.0` - Web framework (for DI)

