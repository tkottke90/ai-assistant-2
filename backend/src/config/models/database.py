from pydantic import Field
from .base import BaseConfig

class SQLiteConfig(BaseConfig):
    """Configuration for SQLite database"""

    path: str = Field(default="./data/ai_assistant.db", description="Path to SQLite database file, or ':memory:' for in-memory database")
    create_on_missing: bool = Field(default=True, description="Automatically create database if it doesn't exist")


class DatabaseConfig(BaseConfig):
    """Main database configuration"""

    sqlite: SQLiteConfig = Field(
        default_factory=SQLiteConfig,
        description="Configuration for SQLite database",
    )
