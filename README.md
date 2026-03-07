# AI Assistant 2

A Python/FastAPI backend application with configuration-driven architecture and comprehensive logging and observability support.

> [!CAUTION]
> This product currently does not have any access control mechanisms while in development. You will need to handle your own access control outside of the application if you wish to access this publicly.  I use a site-to-site VPN personally so I do not have to expose the application publicly.

## Project Structure

```
ai-assistant-2/
├── backend/           # Python/FastAPI backend
│   ├── src/           # Source code
│   │   ├── config/    # Configuration system
│   │   ├── logging/   # Logging and OpenTelemetry integration
│   │   ├── controllers/ # API endpoints
│   │   └── static/    # Static files
│   └── tests/         # Test suite
├── config/            # Local configuration files
├── docs/              # Documentation
├── Makefile          # Build and test automation
└── README.md         # This file
```

## Prerequisites

- **Python** (3.10 or higher)
- **pip** (Python package manager)
- **make** (for running Makefile commands)

## Getting Started

### 1. Install Dependencies

Install backend dependencies:

```bash
make setup
```

This will:
- Create a Python virtual environment
- Install all required Python packages
- Install development dependencies (pytest, black, ruff, etc.)

### 2. Configuration

The backend uses a YAML-based configuration system.

**First-time setup:**

1. Copy the example configuration:
   ```bash
   mkdir -p config
   cp config.example.yaml config/config.yaml
   ```

2. Edit `config/config.yaml` to customize settings

**Configuration locations:**
- **Development** (via `make dev`): `./config/config.yaml`
- **Production**: `~/.config/ai-assistant/config.yaml`
- **Custom**: Set `AI_ASSISTANT_CONFIG_DIR` environment variable

See [backend/src/config/README.md](backend/src/config/README.md) for detailed configuration documentation.

### 3. Running the Application

Start the backend development server:

```bash
make dev
```

This will:
- Start the FastAPI server with auto-reload enabled
- Use local configuration from `./config/config.yaml`
- Run on `http://localhost:8000` by default

### 4. Running Tests

The backend uses **pytest** for testing.

#### Run All Tests

```bash
make test
```

#### Run Tests with Coverage

```bash
make test-backend
```

#### Using pytest directly

```bash
cd backend
pytest                    # Run all tests
pytest -v                 # Run with verbose output
pytest --cov=src         # Run with coverage report
pytest tests/test_main.py # Run specific test file
```

**Test Files:**
- Test files are located in `backend/tests/` directory
- Test files follow the pattern `test_*.py` or `*_test.py`
- Configuration: `backend/pyproject.toml`
- Coverage reports: `backend/htmlcov/index.html`

## Development

### Backend Development Server

Start the backend development server:

```bash
make dev
```

```bash
make dev
```

This will:
- Start the FastAPI server with auto-reload enabled
- Use local configuration from `./config/config.yaml`
- Run on `http://localhost:8000` by default
- Enable detailed logging

The server automatically reloads when you make changes to the source code.

### API Documentation

Once the server is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Configuration System

The application uses a configuration-driven architecture with type-safe Pydantic models:

- **Type-safe configuration**: All configs validated at runtime
- **Hot-reload support**: Config changes detected without restart (where applicable)
- **Deprecation handling**: Automatic migration of deprecated fields
- **YAML-based storage**: Human-readable configuration files

**Available configurations:**
- `server`: Server settings (host, port, workers)
- `cors`: CORS middleware configuration
- `logging`: Logging, rotation, and OpenTelemetry settings
- `llm`: LLM provider configuration (future)

See [backend/src/config/README.md](backend/src/config/README.md) for complete documentation.

### Logging System

The application includes a comprehensive logging system with:

- **Hierarchical loggers**: Dot notation (e.g., `ai_assistant.config.loader`)
- **JSON Lines format**: Machine-readable logs for aggregation
- **Automatic rotation**: Prevent log files from growing indefinitely
- **Custom HTTP level**: Log HTTP traffic between DEBUG and INFO
- **Module-specific levels**: Fine-grained control over log verbosity

**Log configuration:**
```yaml
logging:
  level: INFO
  format: json  # or "text" for development
  enable_file_logging: true
  log_file: ~/.config/ai-assistant/logs/app.log
  enable_console_logging: true
```

### Observability & OpenTelemetry

The application supports OpenTelemetry for production observability, enabling:

- **Distributed tracing**: Track requests across services
- **Log aggregation**: Centralized log collection and analysis
- **Metrics export**: (Future) Performance and business metrics
- **Vendor-neutral**: Works with Grafana, Jaeger, Datadog, New Relic, etc.

**Enable OpenTelemetry:**

1. Install OTEL packages:
   ```bash
   cd backend
   pip install -e '.[otel]'
   ```

2. Configure in `config/config.yaml`:
   ```yaml
   logging:
     enable_otel: true
     otel_endpoint: http://alloy:4317
     otel_protocol: grpc
     otel_service_name: ai-assistant
     otel_export_logs: true
     otel_export_traces: true
   ```

**See the complete setup guide:** [docs/grafana-otel-setup.md](docs/grafana-otel-setup.md)

The guide covers:
- Configuring Grafana Alloy to receive OTLP data
- Setting up Loki, Tempo, and Prometheus data sources
- LogQL and TraceQL query examples
- Troubleshooting common issues
- Alternative platform configurations (Jaeger, Datadog, etc.)

### Code Quality

Check Python syntax without running tests:

```bash
make compile
```

This validates all Python files can be compiled successfully.

## Cleaning Up

Remove build artifacts and caches:

```bash
make clean
```

This will remove:
- Python `__pycache__`, `.pytest_cache`, `.mypy_cache`
- Python build artifacts (`*.egg-info`, `build/`, `dist/`)
- Coverage reports (`htmlcov/`, `.coverage`)

## Available Make Commands

```bash
make help           # Show all available commands
make setup          # Install backend dependencies
make dev            # Start development server with auto-reload
make test           # Run all tests
make test-backend   # Run backend tests with coverage
make compile        # Check Python syntax
make clean          # Clean build artifacts
make build          # Build standalone executable (PyInstaller)
```

## Testing Guidelines

### Writing Tests

- Write tests in the `backend/tests/` directory
- Use `test_*.py` naming convention
- Use pytest fixtures for shared setup
- Organize tests to mirror source structure

### Test Structure

```python
import pytest
from src.config.models.logging import LoggingConfig

def test_default_config():
    """Test that default configuration is valid"""
    config = LoggingConfig()
    assert config.level == "INFO"
    assert config.format == "json"

class TestLoggingConfig:
    """Group related tests in classes"""
    
    def test_custom_log_level(self):
        config = LoggingConfig(level="DEBUG")
        assert config.level == "DEBUG"
    
    def test_invalid_level_raises_error(self):
        with pytest.raises(ValueError):
            LoggingConfig(level="INVALID")

@pytest.fixture
def sample_config():
    """Shared test fixture"""
    return LoggingConfig(
        level="INFO",
        format="json",
        enable_otel=True,
        otel_endpoint="http://localhost:4317"
    )

def test_with_fixture(sample_config):
    """Use fixture in test"""
    assert sample_config.enable_otel is True
```

### Running Specific Tests

```bash
# Run specific test file
pytest tests/config/test_manager.py

# Run specific test class
pytest tests/config/test_manager.py::TestConfigManager

# Run specific test function
pytest tests/config/test_manager.py::TestConfigManager::test_singleton

# Run tests matching pattern
pytest -k "config"

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=src --cov-report=html
```

### Test Coverage

View coverage reports after running tests:

```bash
# Generate HTML coverage report
make test-backend

# Open in browser
open backend/htmlcov/index.html
```

## Architecture

### Key Design Patterns

- **Singleton Pattern**: ConfigManager, LoggerManager, OTELManager
- **Dependency Injection**: FastAPI DI for configs and loggers
- **Configuration-Driven**: All behavior controlled via YAML config
- **Type Safety**: Pydantic models validate all inputs
- **Hierarchical Logging**: Dot notation for logger namespaces
- **Lazy Loading**: OTEL packages only loaded when enabled

### Directory Structure

```
backend/src/
├── config/              # Configuration system
│   ├── manager.py       # ConfigManager singleton
│   ├── loader.py        # YAML loading utilities
│   └── models/          # Pydantic config models
│       ├── base.py      # Base configuration class
│       ├── server.py    # Server configuration
│       ├── cors.py      # CORS configuration
│       └── logging.py   # Logging & OTEL configuration
├── logging/             # Logging system
│   ├── manager.py       # LoggerManager singleton
│   ├── formatters.py    # JSON and text formatters
│   ├── handlers.py      # OTEL handler (OTELManager)
│   ├── otel_utils.py    # OTEL availability checks
│   ├── middleware.py    # HTTP logging middleware
│   └── fallback.py      # Startup fallback logger
├── controllers/         # API endpoints
│   └── v1/              # API version 1
│       ├── root.py      # Root endpoints
│       └── config.py    # Config management endpoints
├── static/              # Static files (HTML, CSS, JS)
├── main.py             # Application entry point
└── server.py           # FastAPI app creation
```

## Documentation

- **[Configuration System](backend/src/config/README.md)** - Complete configuration system documentation
- **[Grafana OpenTelemetry Setup](docs/grafana-otel-setup.md)** - Setup guide for Grafana stack integration
- **[Logging System Plan](docs/logging-system-plan.md)** - Logging implementation details
- **[Configuration System Plan](docs/configuration-system-plan.md)** - Configuration architecture

## Contributing

1. Create a new branch for your feature
2. Follow the existing code style and patterns
3. Write tests for your changes
4. Ensure all tests pass with `make test`
5. Run syntax check with `make compile`
6. Update documentation if needed
7. Submit a pull request

### Code Style

The project uses:
- **Black** for Python code formatting
- **Ruff** for linting
- **MyPy** for type checking (optional)

Run formatters before committing:

```bash
cd backend
black src tests
ruff check src tests
```

## License

[GNU GENERAL PUBLIC LICENSE](./LICENSE)