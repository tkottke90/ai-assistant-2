# Logging System Implementation Plan

## 📋 Overview

This document outlines the implementation plan for a comprehensive logging system for the AI Assistant application using Python's built-in `logging` library.

## 🎯 Goals

1. **Hierarchical Logging**: Use dot notation (e.g., `ai_assistant.config`, `ai_assistant.llm.ollama`)
2. **JSON Lines Format**: Machine-readable logs for aggregation and analysis
3. **Automatic Rotation**: Prevent log files from growing indefinitely
4. **OpenTelemetry Support**: Push logs to observability platforms
5. **Custom HTTP Level**: Log HTTP traffic at a level between DEBUG and INFO
6. **HTTP Middleware**: Automatically log all FastAPI requests/responses
7. **Configuration Integration**: Leverage existing config system
8. **Thread Safety**: Ensure safe concurrent logging
9. **Dependency Injection**: Make loggers available via FastAPI DI

## 🏗️ Architecture

### Directory Structure

```
backend/src/
├── logging/
│   ├── __init__.py              # Exports LoggerManager and get_logger
│   ├── manager.py               # LoggerManager singleton class
│   ├── formatters.py            # JSON and text formatters
│   ├── handlers.py              # Custom handlers (OTEL)
│   └── middleware.py            # FastAPI HTTP logging middleware
├── config/
│   └── models/
│       └── logging.py           # LoggingConfig Pydantic model
```

### Core Components

1. **LoggerManager**: Singleton that manages logger instances and custom log levels
2. **JSONFormatter**: Formats log records as JSON Lines
3. **TextFormatter**: Human-readable text formatter for development
4. **HTTPLoggingMiddleware**: FastAPI middleware for automatic request/response logging
5. **OTELHandler**: Custom handler for OpenTelemetry export (optional)
6. **LoggingConfig**: Pydantic model for configuration
7. **Custom HTTP Level**: Log level (15) between DEBUG (10) and INFO (20)

## 📦 Dependencies

### Required Dependencies

Add to `backend/pyproject.toml`:

```toml
dependencies = [
    # ... existing dependencies ...
    "python-json-logger>=2.0.7",  # JSON log formatting
]
```

### Optional Dependencies (OpenTelemetry)

```toml
[project.optional-dependencies]
otel = [
    "opentelemetry-api>=1.20.0",
    "opentelemetry-sdk>=1.20.0",
    "opentelemetry-exporter-otlp>=1.20.0",
]
```

## 🔧 Implementation Phases

### Phase 1: Foundation (Week 1)

#### 1.1 Create Configuration Model

**File**: `backend/src/config/models/logging.py`

**Key Features**:
- Support for DEBUG, HTTP, INFO, WARNING, ERROR, CRITICAL levels
- JSON and text output formats
- File logging with rotation settings (max_bytes, backup_count)
- Console logging with separate level control
- OpenTelemetry configuration (endpoint, service name)
- Module-specific log levels
- HTTP middleware settings (enable, exclude_paths, log bodies)

**Configuration Fields**:
```python
- level: Global log level (default: INFO)
- format: "json" or "text" (default: json)
- enable_file_logging: bool (default: True)
- log_file: Path with ~ expansion (default: ~/.config/ai-assistant/logs/app.log)
- max_bytes: Rotation size (default: 10MB)
- backup_count: Number of backups (default: 5)
- enable_console_logging: bool (default: True)
- console_level: Optional separate console level
- enable_otel: bool (default: False)
- otel_endpoint: Optional OTLP endpoint
- otel_service_name: Service name (default: ai-assistant)
- module_levels: Dict of module-specific levels
- enable_http_logging: bool (default: True)
- log_request_body: bool (default: False)
- log_response_body: bool (default: False)
- exclude_paths: List of paths to exclude (default: ["/health"])
```

#### 1.2 Update ConfigManager

**File**: `backend/src/config/manager.py`

- Add `LoggingConfig` to `_config_models` registry
- Import and register the new model

**File**: `backend/src/config/models/__init__.py`

- Export `LoggingConfig`

#### 1.3 Create Formatters

**File**: `backend/src/logging/formatters.py`

**JSONFormatter**:
- Output JSON Lines format (one JSON object per line)
- Include: timestamp (ISO format), level, logger name, message, module, function, line
- Add exception info if present
- Support extra fields from log records
- Handle serialization of non-JSON types

**TextFormatter**:
- Human-readable format: `[timestamp] [level] [logger] message`
- ISO timestamp format
- Fixed-width level names for alignment

#### 1.4 Create Custom HTTP Log Level

**File**: `backend/src/logging/manager.py`

**Custom Level Registration**:
- Define HTTP_LEVEL_NUM = 15 (between DEBUG=10 and INFO=20)
- Define HTTP_LEVEL_NAME = "HTTP"
- Add level to logging module via `logging.addLevelName()`
- Add `logger.http()` convenience method to Logger class
- Register on LoggerManager initialization

#### 1.5 Create LoggerManager

**File**: `backend/src/logging/manager.py`

**Singleton Pattern**:
- Thread-safe singleton using RLock
- Single instance across application
- Initialize custom HTTP log level on first instantiation

**Configuration Method**:
- `configure(config: LoggingConfig)` - Set up logging system
- Clear existing handlers
- Create and configure formatters (JSON or text)
- Add console handler if enabled
- Add rotating file handler if enabled
- Add OTEL handler if enabled and available
- Set module-specific log levels
- Prevent propagation to root Python logger

**Logger Factory**:
- `get_logger(name: str)` - Get hierarchical logger
- Auto-prefix with "ai_assistant."
- Cache logger instances
- Return cached loggers for repeated calls

**State Management**:
- Track configuration status with `is_configured()`
- Store logger cache
- Thread-safe operations

#### 1.6 Create Package Exports

**File**: `backend/src/logging/__init__.py`

```python
from .manager import LoggerManager, get_logger

__all__ = ["LoggerManager", "get_logger"]
```

#### 1.7 Write Unit Tests

**Files**:
- `backend/tests/logging/test_manager.py`
- `backend/tests/logging/test_formatters.py`
- `backend/tests/config/models/test_logging.py`

**Test Coverage**:
- Singleton pattern enforcement
- Hierarchical logger naming
- JSON and text formatting
- Custom HTTP log level registration
- Configuration validation
- Module-specific log levels
- Thread safety

---

### Phase 2: Integration + HTTP Logging (Week 2)

#### 2.1 Create HTTP Logging Middleware

**File**: `backend/src/logging/middleware.py`

**HTTPLoggingMiddleware Class**:
- Extend `BaseHTTPMiddleware` from Starlette
- Log incoming requests at HTTP level
- Log outgoing responses at appropriate levels:
  - HTTP level (15) for 2xx/3xx responses
  - WARNING level for 4xx responses
  - ERROR level for 5xx responses
- Measure and log request duration
- Support excluding specific paths (e.g., /health)
- Optional request/response body logging (disabled by default)
- Extract and log structured data:
  - method, path, query_params
  - client_host, user_agent
  - status_code, duration_ms

**Configuration Options**:
- `log_request_body`: bool (security risk if enabled)
- `log_response_body`: bool (performance impact if enabled)
- `exclude_paths`: list[str] (paths to skip logging)

**Error Handling**:
- Catch and log exceptions during request processing
- Include full stack trace for 5xx errors
- Ensure middleware doesn't break request flow

#### 2.2 Integrate Logging in Server

**File**: `backend/src/server.py`

**Initialization Order**:
1. Initialize ConfigManager
2. Initialize LoggerManager
3. Load LoggingConfig
4. Configure LoggerManager
5. Create module logger
6. Add CORS middleware
7. Add HTTPLoggingMiddleware (after CORS)
8. Register routers

**Replace Print Statements**:
- Startup validation: Use `logger.info()` and `logger.error()`
- Static directory warning: Use `logger.warning()`
- Configuration messages: Use appropriate log levels

**Middleware Configuration**:
```python
app.add_middleware(
    HTTPLoggingMiddleware,
    log_request_body=logging_config.log_request_body,
    log_response_body=logging_config.log_response_body,
    exclude_paths=logging_config.exclude_paths,
)
```

#### 2.3 Update Example Configuration

**File**: `config.example.yaml`

Add complete logging section with:
- All configuration options documented
- Sensible defaults
- Comments explaining each option
- Examples of module-specific levels
- HTTP middleware configuration
- Security warnings for sensitive options

#### 2.4 Write Integration Tests

**File**: `backend/tests/logging/test_middleware.py`

**Test Scenarios**:
- Successful requests logged at HTTP level
- 4xx responses logged at WARNING level
- 5xx responses logged at ERROR level
- Excluded paths not logged
- Request duration measured
- Structured data included in logs
- Exception handling and logging

---

### Phase 3: Migration (Week 3)

#### 3.1 Replace Print Statements in Config System

**Files to Update**:
- `backend/src/config/manager.py`
- `backend/src/config/models/base.py`
- `backend/src/config/loader.py`

**Migration Strategy**:
- Create module-specific loggers (e.g., `get_logger("config.manager")`)
- Replace `print()` with appropriate log levels:
  - Info messages → `logger.info()`
  - Warnings → `logger.warning()`
  - Errors → `logger.error()`
  - Debug info → `logger.debug()`
- Use lazy formatting: `logger.info("Message %s", value)` not f-strings
- Add structured data via `extra` parameter where useful

**Specific Replacements**:
- Config directory detection → INFO
- Deprecated field warnings → WARNING
- Config file creation → INFO
- Validation errors → ERROR
- Migration messages → WARNING

- [x] Add safe startup fallback logger (`backend/src/logging/fallback.py`) to capture import-time messages and replay after LoggerManager is configured

#### 3.2 Add Logging to Controllers

**Files**:
- `backend/src/controllers/v1/config.py`
- `backend/src/controllers/v1/root.py`
- Future controller files

**Logging Points**:
- Request received (DEBUG level)
- Validation errors (WARNING level)
- Processing errors (ERROR level)
- Successful operations (INFO level)
- Include request context in extra fields

**Example Pattern**:
```python
logger = get_logger("controllers.config")

@router.get("/{feature}")
def get_feature_config(feature: str):
    logger.debug("Fetching config for feature: %s", feature)
    try:
        config = config_manager.get_config(feature)
        logger.info("Config retrieved successfully", extra={"feature": feature})
        return config
    except ValueError as e:
        logger.warning("Invalid feature requested: %s", feature, extra={"error": str(e)})
        raise HTTPException(status_code=404, detail=str(e))
```

#### 3.3 Document Usage Patterns

**File**: `backend/src/logging/README.md` (new)

**Documentation Sections**:
- Quick start guide
- Logger naming conventions
- Log level guidelines
- Lazy formatting examples
- Structured logging with extra fields
- Best practices
- Security considerations
- Performance tips

---

### Phase 4: Advanced Features (Week 4)

#### 4.1 Implement OpenTelemetry Handler

**File**: `backend/src/logging/handlers.py`

**OTELHandler Class**:
- Check for OpenTelemetry package availability
- Create OTLP log exporter
- Set up logger provider with service name
- Configure batch log processor
- Emit logs to OTLP endpoint
- Handle connection failures gracefully
- Log warnings if OTEL packages not installed

**Configuration**:
- Endpoint URL (e.g., http://localhost:4317)
- Service name for identification
- Batch processing settings
- Insecure mode for development

#### 4.2 Test OpenTelemetry Integration

**Test Setup**:
- Use local OTEL collector for testing
- Verify logs exported correctly
- Test connection failure handling
- Verify structured data preservation
- Test with different log levels

**Documentation**:
- Setup guide for OTEL collector
- Configuration examples
- Integration with observability platforms:
  - Jaeger
  - Grafana
  - Datadog
  - New Relic

#### 4.3 Add Performance Monitoring

**Logging Enhancements**:
- Add performance metrics to logs
- Track slow requests (configurable threshold)
- Log resource usage periodically
- Add correlation IDs for request tracing

**Example**:
```python
# Log slow requests
if duration_ms > slow_request_threshold:
    logger.warning(
        "Slow request detected",
        extra={
            "duration_ms": duration_ms,
            "threshold_ms": slow_request_threshold,
            "method": method,
            "path": path
        }
    )
```

#### 4.4 Create Best Practices Guide

**File**: `docs/logging-best-practices.md` (new)

**Topics**:
- When to use each log level
- Hierarchical logger naming
- Lazy formatting for performance
- Structured logging patterns
- Security considerations (PII, credentials)
- Performance optimization
- Log aggregation strategies
- Troubleshooting common issues

---

## 📊 Example Outputs

### JSON Lines Format

```json
{"timestamp": "2024-01-22T10:30:45.123456", "level": "INFO", "logger": "ai_assistant.server", "message": "All configurations validated successfully", "module": "server", "function": "validate_configs", "line": 42}
{"timestamp": "2024-01-22T10:30:45.234567", "level": "HTTP", "logger": "ai_assistant.server.http", "message": "→ GET /api/v1/health", "method": "GET", "path": "/api/v1/health", "query_params": {}, "client_host": "127.0.0.1", "module": "middleware", "function": "dispatch", "line": 78}
{"timestamp": "2024-01-22T10:30:45.245678", "level": "HTTP", "logger": "ai_assistant.server.http", "message": "← GET /api/v1/health - 200 - 11.23ms", "method": "GET", "path": "/api/v1/health", "status_code": 200, "duration_ms": 11.23, "module": "middleware", "function": "dispatch", "line": 145}
```

### Text Format

```
[2024-01-22 10:30:45] [INFO    ] [ai_assistant.server] All configurations validated successfully
[2024-01-22 10:30:45] [HTTP    ] [ai_assistant.server.http] → GET /api/v1/health
[2024-01-22 10:30:45] [HTTP    ] [ai_assistant.server.http] ← GET /api/v1/health - 200 - 11.23ms
```

---

## 📝 Configuration Examples

### Development Configuration

```yaml
logging:
  level: DEBUG
  format: text
  enable_file_logging: true
  log_file: ~/.config/ai-assistant/logs/app.log
  max_bytes: 10485760
  backup_count: 5
  enable_console_logging: true
  console_level: HTTP
  enable_otel: false
  module_levels:
    ai_assistant.llm: DEBUG
    ai_assistant.config: INFO
  enable_http_logging: true
  log_request_body: true
  log_response_body: false
  exclude_paths: ["/health"]
```

### Production Configuration

```yaml
logging:
  level: INFO
  format: json
  enable_file_logging: true
  log_file: /var/log/ai-assistant/app.log
  max_bytes: 52428800  # 50 MB
  backup_count: 10
  enable_console_logging: true
  console_level: WARNING
  enable_otel: true
  otel_endpoint: http://otel-collector:4317
  otel_service_name: ai-assistant-prod
  module_levels:
    ai_assistant.server.http: HTTP
  enable_http_logging: true
  log_request_body: false
  log_response_body: false
  exclude_paths: ["/health", "/metrics"]
```

---

## 🧪 Testing Strategy

### Unit Tests

**Coverage Requirements**: >80%

**Test Files**:
- `test_manager.py`: LoggerManager singleton, configuration, logger factory
- `test_formatters.py`: JSON and text formatting
- `test_handlers.py`: OTEL handler (if packages available)
- `test_middleware.py`: HTTP logging middleware
- `test_logging_config.py`: Configuration model validation

**Key Test Cases**:
- Singleton pattern enforcement
- Thread safety
- Custom log level registration
- Hierarchical naming
- Format validation
- Rotation behavior
- Module-specific levels
- Middleware request/response logging
- Error handling

### Integration Tests

**Test Scenarios**:
- End-to-end logging flow
- FastAPI integration
- Configuration changes
- Log file rotation
- OTEL export (with mock collector)
- Performance under load

### Performance Tests

**Metrics to Track**:
- Logging overhead per request
- File I/O performance
- Memory usage
- Log rotation impact
- OTEL export latency

---

## 📚 Usage Examples

### Basic Usage

```python
from src.logging import get_logger

logger = get_logger("llm.ollama")

logger.debug("Initializing Ollama client")
logger.info("Connected to Ollama at %s", endpoint)
logger.warning("Model not found, using default")
logger.error("Failed to generate response", exc_info=True)
```

### Structured Logging

```python
logger.info(
    "LLM request completed",
    extra={
        "model": "llama2",
        "tokens": 150,
        "duration_ms": 234,
        "temperature": 0.7
    }
)
```

### HTTP Level Logging

```python
logger = get_logger("server.middleware")

logger.http("Processing request: %s %s", method, path)
logger.http(
    "Request completed",
    extra={
        "method": "POST",
        "path": "/api/v1/chat",
        "status": 200,
        "duration_ms": 456
    }
)
```

### In FastAPI Endpoints

```python
from fastapi import APIRouter
from src.logging import get_logger

router = APIRouter()
logger = get_logger("controllers.chat")

@router.post("/chat")
async def chat(message: str):
    logger.info("Received chat message", extra={"length": len(message)})
    try:
        response = await process_message(message)
        logger.info("Chat response generated successfully")
        return response
    except Exception as e:
        logger.error("Failed to process chat message", exc_info=True)
        raise
```

---

## 🎯 Success Criteria

- ✅ All `print()` statements replaced with proper logging
- ✅ Logs output in JSON Lines format
- ✅ Automatic log rotation working
- ✅ Custom HTTP log level functional
- ✅ HTTP middleware logging all requests/responses
- ✅ Module-specific log levels configurable
- ✅ OpenTelemetry integration functional (optional)
- ✅ Unit test coverage > 80%
- ✅ Documentation complete
- ✅ Zero performance degradation
- ✅ Thread-safe operations verified
- ✅ Integration with existing config system

---

## 🔍 Monitoring & Observability

### Log Aggregation Platforms

JSON Lines format enables easy integration with:
- **Elasticsearch + Kibana**: Full-text search and visualization
- **Grafana Loki**: Lightweight log aggregation
- **Datadog**: APM and log correlation
- **Splunk**: Enterprise log management
- **CloudWatch**: AWS native logging

### OpenTelemetry Integration

Benefits:
- Unified observability (logs, traces, metrics)
- Vendor-neutral format
- Correlation with distributed traces
- Standard instrumentation
- Wide platform support

### Querying Structured Logs

Example queries with JSON logs:
```bash
# Find all slow requests
jq 'select(.duration_ms > 1000)' app.log

# Count requests by status code
jq -r '.status_code' app.log | sort | uniq -c

# Find all errors from specific module
jq 'select(.level == "ERROR" and .logger | startswith("ai_assistant.llm"))' app.log
```

---

## 📝 Best Practices

### Log Levels

- **DEBUG**: Detailed diagnostic information (disabled in production)
- **HTTP**: HTTP request/response details (custom level)
- **INFO**: General informational messages
- **WARNING**: Warning messages for potentially harmful situations
- **ERROR**: Error messages for serious problems
- **CRITICAL**: Critical messages for very serious errors

### Naming Conventions

- Use hierarchical dot notation: `ai_assistant.module.submodule`
- Match file structure: `src/llm/ollama.py` → `ai_assistant.llm.ollama`
- Be consistent across the application

### Performance

- Use lazy formatting: `logger.info("User %s", user_id)` not f-strings
- Avoid expensive operations in log arguments
- Use appropriate log levels (DEBUG disabled in production)
- Consider excluding high-frequency endpoints from HTTP logging

### Security

- Never log sensitive data: API keys, passwords, tokens, PII
- Be cautious with request/response body logging
- Sanitize user input before logging
- Use separate log files for audit trails

### Structured Data

- Use `extra` parameter for structured fields
- Keep field names consistent
- Use snake_case for field names
- Include context: user_id, request_id, session_id

---

## 🚀 Rollout Checklist

### Pre-Implementation
- [ ] Review and approve plan
- [ ] Identify all print statements to replace
- [x] Set up test environment
- [x] Install dependencies
- [x] Add `make compile` target to Makefile
- [x] Update copilot instructions with new workflow commands


### Phase 1: Foundation
- [x] Create LoggingConfig model
- [x] Update ConfigManager
- [x] Implement formatters
- [x] Create LoggerManager with HTTP level
- [x] Write unit tests


### Phase 2: Integration
- [x] Create HTTP logging middleware
- [x] Integrate in server.py
- [x] Replace print statements in server
- [x] Update example configuration

### Phase 3: Migration
- [x] Replace prints in config system
- [x] Add logging to controllers
- [ ] Document usage patterns
- [ ] Update existing code
- [ ] Verify all modules logging correctly

### Phase 4: Advanced
- [ ] Implement OTEL handler
- [ ] Test OTEL integration
- [ ] Add performance monitoring
- [ ] Create best practices guide
- [ ] Final code review

### Post-Implementation
- [ ] Monitor log volume
- [ ] Verify rotation working
- [ ] Check performance impact
- [ ] Gather team feedback
- [ ] Update documentation as needed

---

## 📚 Related Documentation

- [Configuration System Plan](./configuration-system-plan.md)
- [Configuration System README](../backend/src/config/README.md)
- [Python Logging Documentation](https://docs.python.org/3/library/logging.html)
- [FastAPI Middleware](https://fastapi.tiangolo.com/tutorial/middleware/)
- [OpenTelemetry Python](https://opentelemetry.io/docs/instrumentation/python/)

---

## 🤝 Contributing

When adding new logging:
1. Use `get_logger(__name__)` or `get_logger("module.name")`
2. Choose appropriate log level
3. Use lazy formatting for performance
4. Add structured data via `extra` when useful
5. Never log sensitive information
6. Update tests for new logging code

---

**Document Version**: 1.0
**Last Updated**: 2024-01-22
**Status**: Draft - Ready for Review


