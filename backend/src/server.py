from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .controllers.v1 import router as v1_router
from .config.manager import ConfigManager

app = FastAPI(
    title="AI Assistant API",
    description="Backend API for AI Assistant application",
    version="0.1.0",
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
app.include_router(v1_router, prefix="/api/v1")

# Startup event handler for configuration validation
@app.on_event("startup")
async def validate_configs():
    """Validate all configurations on startup and check for deprecations"""
    try:
        # Check for deprecated fields first (before loading)
        config_manager._validate_all_configs_for_deprecations()

        # Load and validate all configs
        config_manager.get_all_configs()
        print("✓ All configurations validated successfully")
    except Exception as e:
        print(f"✗ Configuration validation failed: {e}")
        raise


# Mount static files
# This allows serving HTML, CSS, JS, and other static assets
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir)), name="static")
else:
    print(f"Static directory not found: {static_dir}")


