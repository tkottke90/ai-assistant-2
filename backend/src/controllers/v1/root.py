from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

@router.get("/health", tags=["health"])
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@router.get("/")
def get_root():
    """Root endpoint"""
    return {
        "message": "Welcome to AI Assistant API!",
        "version": "1.0.0",
        "links": {
            "documentation": "/docs",
            "openapi_spec": "/openapi.json",
            "health_check": "/health"
        }
    }
