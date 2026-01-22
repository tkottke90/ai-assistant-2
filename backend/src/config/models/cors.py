from typing import List
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar


class CorsConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False

    allow_origins: List[str] = Field(
        default=["http://localhost:5173"], description="Allowed CORS origins"
    )
    allow_credentials: bool = Field(default=True)
    allow_methods: List[str] = Field(default=["*"])
    allow_headers: List[str] = Field(default=["*"])

