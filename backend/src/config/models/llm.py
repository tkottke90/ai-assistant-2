from typing import Optional, Literal
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar


class LLMConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False

    provider: Literal["ollama", "anthropic", "openai"] = Field(
        default="ollama", description="LLM provider to use"
    )
    model: str = Field(default="llama2", description="Model name")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1)
    api_key: Optional[str] = Field(default=None, description="API key for provider")
    base_url: Optional[str] = Field(
        default="http://localhost:11434", description="Base URL for Ollama"
    )

