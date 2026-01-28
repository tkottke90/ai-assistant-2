from typing import ClassVar, Literal
from pydantic import Field
from .base import BaseConfig


class CredentialsConfig(BaseConfig):
    """
    Configuration for credential validation and management.
    
    Controls how the system validates external service credentials,
    including retry logic, circuit breaker patterns, and future
    keychain integration support.
    
    Example YAML configuration:
        credentials:
          strategy: lazy
          retry_attempts: 3
          retry_backoff_base_seconds: 0.1
          circuit_breaker_enabled: true
          circuit_breaker_failure_threshold: 3
    """

    requires_restart: ClassVar[bool] = False

    # Validation settings
    strategy: Literal["lazy", "startup", "disabled"] = Field(
        default="lazy",
        description="When to validate credentials: 'lazy' (on first use), 'startup' (at app start), 'disabled' (skip validation)"
    )
    
    warn_on_missing: bool = Field(
        default=True,
        description="Log warnings when required credentials are missing"
    )

    # Retry settings
    retry_attempts: int = Field(
        default=3,
        ge=0,
        le=10,
        description="Number of retry attempts for failed credential validation (0-10)"
    )
    
    retry_backoff_base_seconds: float = Field(
        default=0.1,
        gt=0,
        description="Base delay in seconds for exponential backoff (must be positive)"
    )
    
    retry_backoff_max_seconds: float = Field(
        default=5.0,
        gt=0,
        description="Maximum delay in seconds for exponential backoff (must be positive)"
    )
    
    retry_total_timeout_seconds: float = Field(
        default=10.0,
        gt=0,
        description="Total timeout in seconds for all retry attempts (must be positive)"
    )
    
    cache_duration_seconds: int = Field(
        default=300,
        ge=0,
        description="Duration in seconds to cache validated credentials (0 = no caching)"
    )

    # Circuit breaker settings
    circuit_breaker_enabled: bool = Field(
        default=True,
        description="Enable circuit breaker pattern for credential validation"
    )
    
    circuit_breaker_failure_threshold: int = Field(
        default=3,
        ge=1,
        description="Number of consecutive failures before opening circuit (minimum 1)"
    )
    
    circuit_breaker_recovery_seconds: int = Field(
        default=3600,
        gt=0,
        description="Time in seconds before attempting to close an open circuit (must be positive)"
    )
    
    circuit_breaker_half_open_max_attempts: int = Field(
        default=1,
        ge=1,
        description="Maximum validation attempts when circuit is half-open (minimum 1)"
    )

    # Future: Keychain integration
    keychain_enabled: bool = Field(
        default=False,
        description="Enable Keychain integration for credential storage (future feature)"
    )
    
    keychain_service_name: str = Field(
        default="ai-assistant-2",
        description="Service name for keychain entries"
    )
