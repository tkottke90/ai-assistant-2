from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .controllers.v1 import router as v1_router

# Import routers (we'll create these next)
# from src.controllers.example_router import router as example_router

app = FastAPI(
    title="AI Assistant API",
    description="Backend API for AI Assistant application",
    version="0.1.0"
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default dev server port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(v1_router, prefix="/api/v1", tags=["v1"])

# Mount static files
# This allows serving HTML, CSS, JS, and other static assets
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir)), name="static")


