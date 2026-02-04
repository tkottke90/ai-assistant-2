from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .controllers.v1 import router as v1_router
from .config.manager import ConfigManager
from .logging import LoggerManager, get_logger, is_otel_instrumentation_available
from .logging.middleware import HTTPLoggingMiddleware
from .database import initialize_database

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger = get_logger("server")
    logger.info("Application starting up")
    
    # Initialize config manager
    config_manager = ConfigManager()
    
    # Initialize logging
    logger_manager = LoggerManager()
    logging_config = config_manager.get_config("logging")

    logger_manager.configure(
        config_manager._get_config_directory(),
        logging_config
    )
    
    # Initialize database
    initialize_database(config_manager)
    
    # Auto-instrument FastAPI with OTEL if enabled
    if logging_config.enable_otel and logging_config.otel_export_traces:
        if is_otel_instrumentation_available():
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            FastAPIInstrumentor.instrument_app(app)
            logger.info("FastAPI auto-instrumentation enabled")
        else:
            logger.warning(
                "OTEL traces enabled but instrumentation package not available. "
                "Install with: pip install -e '.[otel]'"
            )
    
    # Validate configurations
    try:
        # Check for deprecated fields first (before loading)
        config_manager._validate_all_configs_for_deprecations()

        # Load and validate all configs
        config_manager.get_all_configs()
        logger.info("All configurations validated successfully")
    except Exception as e:
        logger.error("Configuration validation failed: %s", e, exc_info=True)
        raise
    
    yield
    
    # Shutdown
    logger.info("Application shutting down")
    logger_manager.shutdown()


app = FastAPI(
    title="AI Assistant API",
    description="Backend API for AI Assistant application",
    version="0.1.0",
    lifespan=lifespan,
)

# Initialize config manager
config_manager = ConfigManager()

# Get configs
logging_config = config_manager.get_config("logging")
cors_config = config_manager.get_config("cors")
logger = get_logger("server")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_config.allow_origins,
    allow_credentials=cors_config.allow_credentials,
    allow_methods=cors_config.allow_methods,
    allow_headers=cors_config.allow_headers,
)

# Add HTTP logging middleware (after CORS so CORS headers are included in logs)
if logging_config.enable_http_logging:
    app.add_middleware(
        HTTPLoggingMiddleware,
        log_request_body=logging_config.log_request_body,
        log_response_body=logging_config.log_response_body,
        exclude_paths=logging_config.exclude_paths,
    )

# Register API routers
app.include_router(v1_router, prefix="/api/v1")

# Mount static files
# This allows serving HTML, CSS, JS, and other static assets
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    logger.info("Mounting static files from: %s", static_dir)
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
else:
    logger.warning("Static directory not found: %s", static_dir)


