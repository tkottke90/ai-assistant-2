from pydantic import Field
from .base import BaseConfig
from typing import ClassVar


class ServerConfig(BaseConfig):
    requires_restart: ClassVar[bool] = True

    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, ge=1, le=65535, description="Server port")
    reload: bool = Field(default=True, description="Auto-reload on code changes")
    workers: int = Field(default=1, ge=1, description="Number of worker processes")

