from pathlib import Path
from typing import Optional
from pydantic import field_validator, Field
from .base import BaseConfig

class SQLiteConfig(BaseConfig):
    """Configuration for SQLite database"""

    path: str = Field(default="./data/ai_assistant.db", description="Path to SQLite database file, or ':memory:' for in-memory database")
    create_on_missing: bool = Field(default=True, description="Automatically create database if it doesn't exist")

    @field_validator('path')
    def validate_path(cls, v):
        if v != ":memory:":
            path = Path(v)
            parent = path.parent
            if not parent.exists():
                parent.mkdir(parents=True, exist_ok=True)
            return str(path)
        return v

class DatabaseConfig(BaseConfig):
    """Main database configuration"""

    sqlite: SQLiteConfig = Field(
        default_factory=SQLiteConfig,
        description="Configuration for SQLite database",
    )
