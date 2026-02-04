from typing import Annotated, Optional, Literal, Union, Dict
from pydantic import Discriminator, Field, HttpUrl, field_validator, model_validator
from .base import BaseConfig
from typing import ClassVar
from enum import Enum

class ContextOverflowStrategy(str, Enum):
    SUMMARIZE = "summarize"
    TRUNCATE = "truncate"

class PricingScales(str, Enum):
    FREE = "free"
    PER_K_TOKENS = "per_k_tokens"
    PER_M_TOKENS = "per_m_tokens"

class PricingStructure(BaseConfig):
    """
    Pricing structure for LLM usage
    """

    pricing_scale: PricingScales = Field(
        default=PricingScales.FREE,
        description="Pricing scale for LLM usage.  This contextualizes the cost fields.  For example, 'per_k_tokens' means costs are per 1000 tokens."
    )

    prompt_cost_per_1k_tokens: float = Field(
        default=0.0,
        ge=0.0,
        description="Cost to send messages to the LLM (input tokens)"
    )

    completion_cost_per_1k_tokens: float = Field(
        default=0.0,
        ge=0.0,
        description="Cost for LLM-generated tokens (output tokens)"
    )

class LLMConfigBase(BaseConfig):
    """
    Base class for LLM provider configurations.
    Defines common fields with conservative defaults suitable for local models.
    """

    # Context limits (conservative defaults for local models like Ollama)
    max_context_activities: int = Field(
        default=10, 
        ge=1, 
        description="Maximum number of past activities to include in context"
    )

    max_context_tokens: int = Field(
        default=3000, 
        ge=-1, 
        description="Maximum number of tokens for the context window.  -1 for unlimited"
    )

    max_tool_definition_tokens: int = Field(
        default=500, 
        ge=50, 
        description="Maximum number of tokens for tool definitions in context"
    )

    top_k: int = Field(
        default=5, 
        ge=1, 
        description="Limits next token selection to the K most likely tokens"
        # See: https://medium.com/@8926581/understanding-top-k-and-top-p-in-prompt-engineering-00a3b93dcd40
    )

    top_p: float = Field(
        default=0.9, 
        ge=0.0, 
        le=1.0,
        description="Cumulative probability threshold for nucleus sampling"
        # See: https://medium.com/@8926581/understanding-top-k-and-top-p-in-prompt-engineering-00a3b93dcd40
    )

    context_overflow_strategy: ContextOverflowStrategy = Field(
        default=ContextOverflowStrategy.TRUNCATE,
        description="Strategy when context exceeds limits (summarize or truncate)"
    )

    temperature: float = Field(
        default=0.7, 
        ge=0.0, 
        le=2.0,
        description="Sampling temperature (0=deterministic, 2=creative)"
    )

    pricing: Dict[str, PricingStructure] = Field(
        default_factory=dict,
        description="Pricing structure for LLM usage optionally by model name"
    )


class OllamaConfig(LLMConfigBase):
    """
    Configuration for Ollama LLM provider
    """
    
    # Type identifier for the configuration
    type: Literal["ollama"] = Field(default="ollama", description="LLM provider type")
    default_model: str = Field(default="mistral:7b")

    api_key: Optional[str] = Field(default=None, description="API key for Ollama (optional)")

    base_url: HttpUrl = Field(
        default="http://localhost:11434", description="Base URL for Ollama server"
    )

class AnthropicConfig(LLMConfigBase):
    """
    Configuration for Anthropic LLM provider
    """
     
    # Type identifier for the configuration
    type: Literal["anthropic"] = Field(default="anthropic", description="LLM provider type")

    api_key_env: str = Field(default="ANTHROPIC_API_KEY", description="Name of environment variable containing API key")

    base_url: Optional[HttpUrl] = Field(
        default=None, description="Base URL for Anthropic API (optional)"
    )

    default_model: str = Field(default="claude-3-5-sonnet-20241022")

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env_exists(cls, v: str) -> str:
        """Warn if environment variable is not set (but don't fail)"""
        import os
        if not os.getenv(v):
            import warnings
            warnings.warn(f"API key environment variable '{v}' is not set")
        return v

    @model_validator(mode='before')
    @classmethod
    def set_anthropic_defaults(cls, data: dict) -> dict:
        """Override base class defaults for Anthropic's large context windows"""
        if not isinstance(data, dict):
            return data
        
        # Set Anthropic-specific defaults (only if not explicitly provided)
        data.setdefault('max_context_activities', 50)
        data.setdefault('max_context_tokens', 150000)
        data.setdefault('max_tool_definition_tokens', 2000)
        return data

class OpenAIConfig(LLMConfigBase):
    """
    Configuration for OpenAI LLM provider
    """

    # Type identifier for the configuration
    type: Literal["openai"] = Field(default="openai", description="LLM provider type")

    api_key_env: str = Field(default="OPENAI_API_KEY", description="Name of environment variable containing API key")

    base_url: Optional[HttpUrl] = Field(
        default=None, description="Base URL for OpenAI API (optional)"
    )

    default_model: str = Field(default="gpt-4")

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env_exists(cls, v: str) -> str:
        """Warn if environment variable is not set (but don't fail)"""
        import os
        if not os.getenv(v):
            import warnings
            warnings.warn(f"API key environment variable '{v}' is not set")
        return v

    @model_validator(mode='before')
    @classmethod
    def set_openai_defaults(cls, data: dict) -> dict:
        """Override base class defaults for OpenAI's large context windows"""
        if not isinstance(data, dict):
            return data
        
        # Set OpenAI-specific defaults (only if not explicitly provided)
        data.setdefault('max_context_activities', 50)
        data.setdefault('max_context_tokens', 120000)
        data.setdefault('max_tool_definition_tokens', 2000)
        return data


# Create a discriminated union for LLM provider configs, this has
# a couple of key benefits:
#
# 1. Performance: No trial-and-error through all union types
# 2. Better errors: If you provide type: anthropic with Ollama-specific fields, you get a clear error about AnthropicConfig
# 3. Type safety: IDEs/type checkers can better understand which fields are valid
# 4. Self-documenting: The discriminator makes it explicit which field determines the type
# 
# Without discriminator: Pydantic tries OllamaConfig first, fails 
#   validation (missing fields), tries AnthropicConfig, maybe succeeds.
# With discriminator: Pydantic reads type: "anthropic" and directly 
#   uses AnthropicConfig. Faster and clearer errors if wrong fields provided.
#
LLMProviderConfig = Annotated[
    Union[OllamaConfig, AnthropicConfig, OpenAIConfig], # Add additional providers here to include them
    Discriminator('type')
]

class LLMConfig(BaseConfig):
    """
    Configuration for Large Language Model (LLM) providers
    """

    # Changes to this config require application restart
    requires_restart: ClassVar[bool] = True

    # List of supported LLM providers
    providers: Dict[str, LLMProviderConfig] = Field(
        default_factory=lambda: {"ollama": OllamaConfig(type="ollama")},
        description="Available LLM providers keyed by name"
    )

    # Specify the default provider by its type
    default_provider: str = Field(
        default="ollama", description="Default LLM provider"
    )

    @field_validator("default_provider")
    @classmethod
    def validate_default_provider(cls, v: str, info) -> str:
        """Ensure default_provider references an existing provider"""
        if "providers" in info.data and v not in info.data["providers"]:
            raise ValueError(
                f"default_provider '{v}' must exist in providers. Available: {list(info.data['providers'].keys())}"
            )
        return v
    
    def get_default_provider(self) -> LLMProviderConfig:
        """Get the default LLM provider configuration"""
        return self.providers[self.default_provider]

