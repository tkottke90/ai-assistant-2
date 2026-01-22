# Configuration System Implementation Plan

## 📋 Overview

This document outlines the plan for implementing a robust configuration management system for the AI Assistant application.

### Requirements

1. Configuration stored as YAML file
2. Configuration location: `~/.config/ai-assistant/config.yaml` (Unix) or equivalent on other platforms
3. Runtime configuration modification via API
4. Some configurations (e.g., server port/host) require restart
5. Configurations pulled dynamically when used (not just at startup)
6. Configurations organized by feature
7. Each feature has a Pydantic model defining its structure
8. Application can generate default configuration from Pydantic models
9. Explicit refresh endpoint for reloading after manual file edits

## 🏗️ Architecture

### Directory Structure

```
backend/src/config/
├── __init__.py              # Exports main ConfigManager
├── manager.py               # ConfigManager singleton class
├── models/                  # Pydantic models for each feature
│   ├── __init__.py
│   ├── base.py             # Base config model
│   ├── server.py           # Server configuration
│   ├── cors.py             # CORS configuration
│   ├── llm.py              # LLM provider configuration
│   ├── database.py         # Database configuration (future)
│   └── logging.py          # Logging configuration (future)
├── loader.py               # YAML file I/O operations
└── defaults.py             # Default configuration generator (optional)
```

### Core Components

#### 1. Configuration Models (Pydantic)

Each feature has a Pydantic model that:
- Defines the configuration structure
- Provides validation and type safety
- Specifies default values
- Indicates if changes require restart

#### 2. Configuration Manager (Singleton)

The ConfigManager:
- Loads/saves YAML configuration files
- Provides thread-safe access to configuration
- Supports hot-reloading via refresh endpoint
- Tracks which configs require restart
- Caches configurations for performance

#### 3. Configuration Loader

Handles YAML file I/O:
- Thread-safe file reading/writing
- Creates config directory if needed
- Handles missing files gracefully

#### 4. API Endpoints

RESTful endpoints for configuration management:
- `GET /api/v1/config` - Get all configurations
- `GET /api/v1/config/{feature}` - Get specific feature config
- `PUT /api/v1/config/{feature}` - Update specific feature config
- `POST /api/v1/config/reset` - Reset to defaults
- `POST /api/v1/config/refresh` - Reload all configs from disk
- `POST /api/v1/config/{feature}/refresh` - Reload specific feature from disk
- `GET /api/v1/config/schema` - Get JSON schema for all configs

## 📝 Implementation Phases

### Phase 1: Core Infrastructure

#### Step 1.1: Add Dependencies

Add to `backend/pyproject.toml`:
```toml
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.5.0",
    "pyyaml>=6.0.1",  # NEW
]
```

#### Step 1.2: Create Base Configuration Model

File: `backend/src/config/models/base.py`

```python
from pydantic import BaseModel
from typing import ClassVar

class BaseConfig(BaseModel):
    """Base class for all configuration models"""

    # Class variable to indicate if changes require restart
    requires_restart: ClassVar[bool] = False

    class Config:
        extra = "allow"  # Forward compatibility
        use_enum_values = True
```

**Design Rationale: Why ClassVar for `requires_restart`**

The `requires_restart` field is implemented as a `ClassVar[bool]` rather than a regular instance field for several important reasons:

1. **Separation of Concerns**: `requires_restart` is metadata about the configuration class itself, not user-configurable data. It describes a property of the configuration type, not a value that users should modify.

2. **Clean YAML Files**: By using `ClassVar`, this field is excluded from Pydantic's serialization, keeping YAML configuration files clean and focused on user-configurable values only. Users never see or need to worry about this field in their config files.

3. **Prevents User Error**: Since `requires_restart` is not serialized to YAML, users cannot accidentally modify it and break the system's restart logic. The restart requirement is determined by developers, not users.

4. **Type System Enforcement**: Python's type system and Pydantic both recognize `ClassVar` as class-level metadata, making the distinction between metadata and data explicit and enforced.

5. **Simpler API Responses**: Configuration API responses contain only user data. Restart requirements are communicated separately through dedicated response fields, keeping concerns properly separated.

This design follows the **Metadata Pattern** where class-level attributes define immutable properties of the configuration type, while instance-level attributes contain mutable user data.

#### Step 1.3: Create Feature Configuration Models

**Server Config** (`backend/src/config/models/server.py`):
```python
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class ServerConfig(BaseConfig):
    requires_restart: ClassVar[bool] = True
    
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, ge=1, le=65535, description="Server port")
    reload: bool = Field(default=True, description="Auto-reload on code changes")
    workers: int = Field(default=1, ge=1, description="Number of worker processes")
```

**CORS Config** (`backend/src/config/models/cors.py`):
```python
from typing import List
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class CorsConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False
    
    allow_origins: List[str] = Field(
        default=["http://localhost:5173"],
        description="Allowed CORS origins"
    )
    allow_credentials: bool = Field(default=True)
    allow_methods: List[str] = Field(default=["*"])
    allow_headers: List[str] = Field(default=["*"])
```

**LLM Config** (`backend/src/config/models/llm.py`):
```python
from typing import Optional, Literal
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar

class LLMConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False
    
    provider: Literal["ollama", "anthropic", "openai"] = Field(
        default="ollama",
        description="LLM provider to use"
    )
    model: str = Field(default="llama2", description="Model name")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1)
    api_key: Optional[str] = Field(default=None, description="API key for provider")
    base_url: Optional[str] = Field(
        default="http://localhost:11434",
        description="Base URL for Ollama"
    )
```

#### Step 1.4: Create Configuration Loader

File: `backend/src/config/loader.py`

```python
from pathlib import Path
from typing import Dict, Any
import yaml
from threading import Lock

class ConfigLoader:
    """Handles YAML file I/O operations"""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._lock = Lock()

    def load(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        with self._lock:
            if not self.config_path.exists():
                return {}

            with open(self.config_path, 'r') as f:
                return yaml.safe_load(f) or {}

    def save(self, config: Dict[str, Any]) -> None:
        """Save configuration to YAML file"""
        with self._lock:
            # Ensure directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            with open(self.config_path, 'w') as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False)
```

#### Step 1.5: Create Configuration Manager

File: `backend/src/config/manager.py`

Key features:
- Singleton pattern for global access
- Thread-safe operations with locks
- Lazy loading of configurations
- Cache management
- Refresh capabilities

Core methods:
- `get_config(feature, reload=False)` - Get configuration for a feature
- `update_config(feature, updates)` - Update and save configuration
- `get_all_configs()` - Get all feature configurations
- `reset_to_defaults()` - Reset all configurations to defaults
- `reload_all_from_disk()` - Reload all configs from file
- `reload_feature_from_disk(feature)` - Reload specific feature from file
- `requires_restart(feature)` - Check if feature needs restart
- `get_schema()` - Get JSON schema for all configurations

### Phase 2: API Integration

#### Step 2.1: Create Configuration Controller

File: `backend/src/controllers/v1/config.py`

Endpoints:

**GET /api/v1/config**
- Returns all feature configurations
- No authentication required (can be added later)

**GET /api/v1/config/{feature}**
- Returns specific feature configuration
- Query param: `reload` (boolean) - force reload from disk

**PUT /api/v1/config/{feature}**
- Updates specific feature configuration
- Request body: `{"updates": {...}}`
- Returns updated config and restart requirement

**POST /api/v1/config/reset**
- Resets all configurations to defaults
- Dangerous operation - consider adding confirmation

**POST /api/v1/config/refresh**
- Reloads all configurations from disk
- Returns change detection and restart requirements
- Use after manual file edits

**POST /api/v1/config/{feature}/refresh**
- Reloads specific feature configuration from disk
- Returns change detection and restart requirement
- More efficient than full refresh

**GET /api/v1/config/schema**
- Returns JSON schema for all configurations
- Useful for generating UI forms

#### Step 2.2: Register Configuration Router

Update `backend/src/controllers/v1/__init__.py`:
```python
from fastapi import APIRouter
from . import root, config

router = APIRouter()

router.include_router(root.router, prefix="")
router.include_router(config.router, prefix="")
```

### Phase 3: Application Integration

#### Step 3.1: Update Main Entry Point

File: `backend/src/main.py`

```python
import uvicorn
from src.config.manager import ConfigManager

if __name__ == "__main__":
    # Initialize config manager and get server config
    config_manager = ConfigManager()
    server_config = config_manager.get_config("server")

    uvicorn.run(
        "src.server:app",
        host=server_config.host,
        port=server_config.port,
        reload=server_config.reload,
        workers=server_config.workers
    )
```

#### Step 3.2: Update Server to Use Dynamic CORS Config

File: `backend/src/server.py`

```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .controllers.v1 import router as v1_router
from .config.manager import ConfigManager

app = FastAPI(
    title="AI Assistant API",
    description="Backend API for AI Assistant application",
    version="0.1.0"
)

# Initialize config manager
config_manager = ConfigManager()

# Get CORS config dynamically
cors_config = config_manager.get_config("cors")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_config.allow_origins,
    allow_credentials=cors_config.allow_credentials,
    allow_methods=cors_config.allow_methods,
    allow_headers=cors_config.allow_headers,
)

# Register API routers
app.include_router(v1_router, prefix="/api/v1", tags=["v1"])

# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir)), name="static")
```

#### Step 3.3: Add Startup Validation (Optional)

```python
@app.on_event("startup")
async def validate_configs():
    """Validate all configurations on startup"""
    config_manager = ConfigManager()
    try:
        config_manager.get_all_configs()
        print("✓ All configurations validated successfully")
    except Exception as e:
        print(f"✗ Configuration validation failed: {e}")
        raise
```

### Phase 4: Usage Examples

#### Example 1: Using Config in a Controller

```python
from fastapi import APIRouter, Depends
from ...config.manager import ConfigManager, get_config_manager

router = APIRouter()

@router.get("/llm/status")
def get_llm_status(
    config_manager: ConfigManager = Depends(get_config_manager)
):
    """Get current LLM configuration and status"""
    llm_config = config_manager.get_config("llm")

    return {
        "provider": llm_config.provider,
        "model": llm_config.model,
        "temperature": llm_config.temperature,
        "base_url": llm_config.base_url
    }
```

#### Example 2: Using Config in a Service

```python
from ..config.manager import ConfigManager

class LLMService:
    def __init__(self):
        self.config_manager = ConfigManager()

    def get_client(self):
        """Get LLM client with current configuration"""
        # Always get fresh config
        llm_config = self.config_manager.get_config("llm", reload=True)

        if llm_config.provider == "ollama":
            return self._create_ollama_client(llm_config)
        elif llm_config.provider == "anthropic":
            return self._create_anthropic_client(llm_config)
```

## 🔄 Configuration Workflows

### Workflow 1: API-Based Updates (No Refresh Needed)

```
User → Web UI → PUT /api/v1/config/llm → ConfigManager → YAML File
                                       ↓
                                   Cache Updated
                                       ↓
                                  Changes Active
```

**Steps:**
1. User updates configuration via API endpoint
2. ConfigManager validates and saves to YAML file
3. Cache is automatically updated
4. Changes are immediately active (unless restart required)

### Workflow 2: Manual File Edit + Refresh

```
User → Text Editor → ~/.config/ai-assistant/config.yaml
                                       ↓
User → Web UI → POST /api/v1/config/refresh → ConfigManager
                                                     ↓
                                              Reload from Disk
                                                     ↓
                                              Cache Updated
                                                     ↓
                                              Changes Active
```

**Steps:**
1. User manually edits YAML file with text editor
2. User calls refresh endpoint via API or UI
3. ConfigManager reloads from disk
4. Cache is updated with new values
5. Changes are active (unless restart required)

### Workflow 3: Initial Application Startup

```
Application Start → ConfigManager Init → Check for config.yaml
                                              ↓
                                    File Exists?
                                    ↙         ↘
                                  Yes          No
                                   ↓            ↓
                            Load from File   Use Defaults
                                   ↓            ↓
                                Cache Configs
                                   ↓
                            Application Ready
```

## ✅ Benefits of This Approach

1. **Type Safety**: Pydantic models provide validation and type hints
2. **Feature Isolation**: Each feature has its own config model
3. **Lazy Loading**: Configs are loaded when needed, not just at startup
4. **Thread Safe**: Uses locks for concurrent access
5. **Extensible**: Easy to add new feature configs
6. **Self-Documenting**: JSON schema endpoint provides documentation
7. **Restart Awareness**: Clearly indicates which changes need restart
8. **Default Generation**: Pydantic models define defaults
9. **API-Driven**: Full CRUD operations via REST API
10. **Explicit Control**: Refresh endpoint gives users control over reloading
11. **Change Detection**: API tells users exactly what changed
12. **No External Dependencies**: No file watching libraries needed
13. **Testable**: Easy to test all configuration operations

## 🧪 Testing Strategy

### Unit Tests

**Test Configuration Models:**
```python
def test_server_config_defaults():
    """Test server config has correct defaults"""
    config = ServerConfig()
    assert config.host == "0.0.0.0"
    assert config.port == 8000
    assert config.reload is True

def test_server_config_validation():
    """Test server config validates port range"""
    with pytest.raises(ValidationError):
        ServerConfig(port=70000)  # Invalid port

def test_llm_config_provider_validation():
    """Test LLM config validates provider"""
    with pytest.raises(ValidationError):
        LLMConfig(provider="invalid")  # Not in allowed list
```

**Test ConfigLoader:**
```python
def test_config_loader_creates_directory(tmp_path):
    """Test loader creates config directory"""
    config_path = tmp_path / "config" / "test.yaml"
    loader = ConfigLoader(config_path)
    loader.save({"test": "data"})
    assert config_path.exists()

def test_config_loader_handles_missing_file(tmp_path):
    """Test loader handles missing file gracefully"""
    config_path = tmp_path / "missing.yaml"
    loader = ConfigLoader(config_path)
    result = loader.load()
    assert result == {}
```

**Test ConfigManager:**
```python
def test_config_manager_singleton():
    """Test ConfigManager is a singleton"""
    manager1 = ConfigManager()
    manager2 = ConfigManager()
    assert manager1 is manager2

def test_config_manager_get_config():
    """Test getting configuration"""
    manager = ConfigManager()
    config = manager.get_config("server")
    assert isinstance(config, ServerConfig)

def test_config_manager_update_config():
    """Test updating configuration"""
    manager = ConfigManager()
    updated = manager.update_config("server", {"port": 9000})
    assert updated.port == 9000

def test_config_manager_reload_from_disk(tmp_path):
    """Test reloading configuration from disk"""
    # Setup
    manager = ConfigManager()

    # Manually edit file
    config_data = yaml.safe_load(manager._config_path.read_text())
    config_data['llm']['temperature'] = 0.9
    manager._config_path.write_text(yaml.dump(config_data))

    # Reload
    manager.reload_all_from_disk()

    # Verify
    llm_config = manager.get_config("llm")
    assert llm_config.temperature == 0.9
```

### Integration Tests

**Test API Endpoints:**
```python
def test_get_all_configs(client):
    """Test GET /api/v1/config"""
    response = client.get("/api/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert "server" in data
    assert "cors" in data
    assert "llm" in data

def test_get_feature_config(client):
    """Test GET /api/v1/config/{feature}"""
    response = client.get("/api/v1/config/server")
    assert response.status_code == 200
    data = response.json()
    assert "host" in data
    assert "port" in data

def test_update_feature_config(client):
    """Test PUT /api/v1/config/{feature}"""
    response = client.put(
        "/api/v1/config/llm",
        json={"updates": {"temperature": 0.5}}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["config"]["temperature"] == 0.5

def test_refresh_all_configs(client, config_file):
    """Test POST /api/v1/config/refresh"""
    # Manually edit config file
    config_data = yaml.safe_load(config_file.read_text())
    config_data['llm']['temperature'] = 0.9
    config_file.write_text(yaml.dump(config_data))

    # Call refresh endpoint
    response = client.post("/api/v1/config/refresh")

    assert response.status_code == 200
    data = response.json()
    assert data['success'] is True
    assert 'llm' in data['changes_detected']
    assert data['changes_detected']['llm'] is True

def test_refresh_specific_feature(client, config_file):
    """Test POST /api/v1/config/{feature}/refresh"""
    # Edit LLM config
    config_data = yaml.safe_load(config_file.read_text())
    config_data['llm']['model'] = 'gpt-4'
    config_file.write_text(yaml.dump(config_data))

    # Refresh only LLM config
    response = client.post("/api/v1/config/llm/refresh")

    assert response.status_code == 200
    data = response.json()
    assert data['success'] is True
    assert data['refreshed_features'] == ['llm']

def test_reset_configs(client):
    """Test POST /api/v1/config/reset"""
    # First update a config
    client.put("/api/v1/config/llm", json={"updates": {"temperature": 0.9}})

    # Reset
    response = client.post("/api/v1/config/reset")
    assert response.status_code == 200

    # Verify reset to defaults
    response = client.get("/api/v1/config/llm")
    data = response.json()
    assert data["temperature"] == 0.7  # Default value

def test_get_config_schema(client):
    """Test GET /api/v1/config/schema"""
    response = client.get("/api/v1/config/schema")
    assert response.status_code == 200
    data = response.json()
    assert "server" in data
    assert "properties" in data["server"]
```

### Concurrency Tests

```python
import threading

def test_concurrent_config_access():
    """Test thread-safe config access"""
    manager = ConfigManager()
    results = []

    def get_config():
        config = manager.get_config("server")
        results.append(config.port)

    threads = [threading.Thread(target=get_config) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All threads should get the same value
    assert len(set(results)) == 1

def test_concurrent_config_updates():
    """Test thread-safe config updates"""
    manager = ConfigManager()

    def update_config(port):
        manager.update_config("server", {"port": port})

    threads = [
        threading.Thread(target=update_config, args=(8000 + i,))
        for i in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Final config should be valid
    config = manager.get_config("server", reload=True)
    assert 8000 <= config.port < 8005
```

## 📄 Example Configuration File

### Default `~/.config/ai-assistant/config.yaml`

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
  allow_methods:
    - "*"
  allow_headers:
    - "*"

llm:
  provider: ollama
  model: llama2
  temperature: 0.7
  max_tokens: 2048
  api_key: null
  base_url: http://localhost:11434
```

### Example with Multiple Providers

```yaml
server:
  host: 0.0.0.0
  port: 8000
  reload: false
  workers: 4

cors:
  allow_origins:
    - http://localhost:5173
    - https://myapp.example.com
  allow_credentials: true
  allow_methods:
    - GET
    - POST
    - PUT
    - DELETE
  allow_headers:
    - "*"

llm:
  provider: anthropic
  model: claude-3-sonnet-20240229
  temperature: 0.5
  max_tokens: 4096
  api_key: sk-ant-xxxxxxxxxxxxx
  base_url: null

# Future configurations
database:
  path: ~/.config/ai-assistant/data.db
  enable_fts5: true

logging:
  level: INFO
  file: ~/.config/ai-assistant/logs/app.log
  max_size_mb: 10
  backup_count: 5
```

## 🚀 Usage Examples

### Example 1: User Workflow with Manual Edit

```bash
# 1. User edits config file manually
vim ~/.config/ai-assistant/config.yaml

# Changes made:
# llm:
#   provider: anthropic
#   model: claude-3-sonnet
#   temperature: 0.5

# 2. User calls refresh endpoint
curl -X POST http://localhost:8000/api/v1/config/refresh

# Response:
# {
#   "success": true,
#   "message": "Refreshed 1 configuration(s) from disk",
#   "refreshed_features": ["server", "cors", "llm"],
#   "changes_detected": {
#     "server": false,
#     "cors": false,
#     "llm": true
#   },
#   "requires_restart": []
# }
```

### Example 2: Update via API

```bash
# Update LLM configuration via API
curl -X PUT http://localhost:8000/api/v1/config/llm \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "temperature": 0.8,
      "max_tokens": 3000
    }
  }'

# Response:
# {
#   "success": true,
#   "config": {
#     "provider": "ollama",
#     "model": "llama2",
#     "temperature": 0.8,
#     "max_tokens": 3000,
#     "api_key": null,
#     "base_url": "http://localhost:11434"
#   },
#   "requires_restart": false,
#   "message": "Configuration updated successfully"
# }
```

### Example 3: Get Configuration Schema

```bash
# Get JSON schema for all configurations
curl http://localhost:8000/api/v1/config/schema

# Use schema to generate UI forms or validate external tools
```

### Example 4: Reset to Defaults

```bash
# Reset all configurations to defaults
curl -X POST http://localhost:8000/api/v1/config/reset

# Response:
# {
#   "success": true,
#   "message": "All configurations reset to defaults"
# }
```

## 🎨 Frontend Integration

### React/TypeScript Example

```typescript
// services/configService.ts
export interface ConfigRefreshResponse {
  success: boolean;
  message: string;
  refreshed_features: string[];
  changes_detected: Record<string, boolean>;
  requires_restart: string[];
}

export async function refreshConfig(feature?: string): Promise<ConfigRefreshResponse> {
  const endpoint = feature
    ? `/api/v1/config/${feature}/refresh`
    : '/api/v1/config/refresh';

  const response = await fetch(endpoint, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to refresh configuration');
  }

  return response.json();
}

export async function updateConfig(feature: string, updates: Record<string, any>) {
  const response = await fetch(`/api/v1/config/${feature}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });

  if (!response.ok) {
    throw new Error('Failed to update configuration');
  }

  return response.json();
}

// components/ConfigPanel.tsx
import { useState } from 'react';
import { refreshConfig, updateConfig } from '../services/configService';

export function ConfigPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await refreshConfig();

      if (result.requires_restart.length > 0) {
        setMessage(
          `Configuration refreshed, but restart required for: ${result.requires_restart.join(', ')}`
        );
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage('Failed to refresh configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleRefresh} disabled={loading}>
        {loading ? 'Refreshing...' : 'Reload from File'}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
```

## 🔮 Future Enhancements

### 1. Environment Variable Overrides

Support environment variables for sensitive data:

```python
from pydantic_settings import BaseSettings

class LLMConfig(BaseSettings):
    api_key: Optional[str] = Field(default=None, env="AI_ASSISTANT_LLM_API_KEY")

    class Config:
        env_prefix = "AI_ASSISTANT_"
```

### 2. Configuration Validation on Startup

```python
@app.on_event("startup")
async def validate_configs():
    config_manager = ConfigManager()
    try:
        config_manager.get_all_configs()
        logger.info("✓ All configurations validated successfully")
    except Exception as e:
        logger.error(f"✗ Configuration validation failed: {e}")
        raise
```

### 3. Configuration Change Events

Add observer pattern for config changes:

```python
class ConfigManager:
    def subscribe(self, feature: str, callback: Callable):
        """Subscribe to config changes"""
        if feature not in self._observers:
            self._observers[feature] = []
        self._observers[feature].append(callback)

    def _notify_observers(self, feature: str, config: BaseConfig):
        """Notify observers of config changes"""
        for callback in self._observers.get(feature, []):
            callback(config)
```

### 4. Configuration Backup

Auto-backup before updates:

```python
def update_config(self, feature: str, updates: Dict[str, Any]):
    # Backup current config
    backup_path = self._config_path.with_suffix('.yaml.bak')
    shutil.copy(self._config_path, backup_path)

    # ... rest of update logic
```

### 5. Configuration History

Track configuration changes:

```python
# Store in database or separate file
{
  "timestamp": "2024-01-15T10:30:00Z",
  "feature": "llm",
  "changes": {
    "temperature": {"old": 0.7, "new": 0.5}
  },
  "user": "admin"
}
```

### 6. Configuration Profiles

Support multiple configuration profiles:

```yaml
profiles:
  development:
    server:
      reload: true
      workers: 1
  production:
    server:
      reload: false
      workers: 4
```

### 7. Configuration Encryption

Encrypt sensitive values:

```python
from cryptography.fernet import Fernet

class SecureConfigLoader(ConfigLoader):
    def __init__(self, config_path: Path, encryption_key: bytes):
        super().__init__(config_path)
        self.cipher = Fernet(encryption_key)

    def _decrypt_sensitive_fields(self, config: Dict[str, Any]) -> Dict[str, Any]:
        # Decrypt api_key and other sensitive fields
        pass
```

## 📋 Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [ ] Add `pyyaml` dependency to `pyproject.toml`
- [ ] Create `backend/src/config/` directory structure
- [ ] Implement `BaseConfig` in `models/base.py`
- [ ] Implement `ServerConfig` in `models/server.py`
- [ ] Implement `CorsConfig` in `models/cors.py`
- [ ] Implement `LLMConfig` in `models/llm.py`
- [ ] Implement `ConfigLoader` in `loader.py`
- [ ] Implement `ConfigManager` in `manager.py`
- [ ] Add `get_config_manager()` dependency function
- [ ] Write unit tests for configuration models
- [ ] Write unit tests for ConfigLoader
- [ ] Write unit tests for ConfigManager

### Phase 2: API Integration ✅
- [ ] Create `backend/src/controllers/v1/config.py`
- [ ] Implement `GET /api/v1/config` endpoint
- [ ] Implement `GET /api/v1/config/{feature}` endpoint
- [ ] Implement `PUT /api/v1/config/{feature}` endpoint
- [ ] Implement `POST /api/v1/config/reset` endpoint
- [ ] Implement `POST /api/v1/config/refresh` endpoint
- [ ] Implement `POST /api/v1/config/{feature}/refresh` endpoint
- [ ] Implement `GET /api/v1/config/schema` endpoint
- [ ] Register config router in `v1/__init__.py`
- [ ] Write integration tests for all endpoints

### Phase 3: Application Integration ✅
- [ ] Update `main.py` to use server config
- [ ] Update `server.py` to use CORS config
- [ ] Add startup validation event handler
- [ ] Test application startup with config
- [ ] Test application with missing config file
- [ ] Test application with invalid config file

### Phase 4: Documentation ✅
- [ ] Document configuration file format
- [ ] Document API endpoints (auto-generated via FastAPI)
- [ ] Create user guide for manual config editing
- [ ] Create developer guide for adding new features
- [ ] Add examples to README
- [ ] Update Todo.md to mark configuration system as complete

### Phase 5: Testing ✅
- [ ] Write unit tests for all models
- [ ] Write unit tests for ConfigLoader
- [ ] Write unit tests for ConfigManager
- [ ] Write integration tests for API endpoints
- [ ] Write concurrency tests
- [ ] Write end-to-end tests
- [ ] Achieve >80% code coverage

## 📚 Additional Resources

### Related Files
- `backend/src/main.py` - Application entry point
- `backend/src/server.py` - FastAPI application setup
- `backend/pyproject.toml` - Project dependencies
- `Todo.md` - Project task list

### Dependencies
- **PyYAML**: YAML parsing and generation
- **Pydantic**: Data validation and settings management
- **FastAPI**: Web framework with automatic API documentation

### References
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [PyYAML Documentation](https://pyyaml.org/wiki/PyYAMLDocumentation)
- [FastAPI Dependency Injection](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)

---

**Document Version**: 1.0
**Last Updated**: 2024-01-22
**Status**: Ready for Implementation

