from fastapi import APIRouter, HTTPException
from . import root, config

__all__ = ["router"]

# Setup v1 router
router = APIRouter()

# Include sub-routers
router.include_router(root.router, prefix="")
router.include_router(config.router, prefix="")
