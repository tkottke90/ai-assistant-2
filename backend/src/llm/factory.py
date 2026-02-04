import logging
from threading import RLock
from typing import Optional, Union, Annotated
from fastapi.params import Depends
from .ollama import OllamaClient
from ..config.models.llm import LLMProviderConfig
from ..config.manager import ConfigManager, get_config_manager

LLM_CLIENTS = Union[OllamaClient]

class LlmFactory:
  
  _instance: Optional["LlmFactory"] = None
  _lock = RLock()

  def __new__(cls) -> "LlmFactory":
    """Ensure only one instance exists (singleton pattern)"""
    if cls._instance is None:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
    return cls._instance

  def __init__(self) -> None:
    """Initialize the configuration manager"""
    # Only initialize once
    if hasattr(self, "_initialized"):
        return

    # Lock for thread-safe operations
    self._operation_lock = RLock()

  def _get_logger(self) -> logging.Logger:
    """
    Get logger for config manager

    Returns basic logger if logging system not configured yet,
    otherwise returns the configured logger
    """
    try:
        from ..logging import get_logger
        return get_logger("llm_factory")
    except (ImportError, AttributeError):
        # Logging system not initialized yet, use basic logger
        return logging.getLogger("ai_assistant.config.manager")

  def create_llm_with_config(self, config: LLMProviderConfig) -> LLM_CLIENTS:
    """
    Create an LLM instance based on the provided configuration.
    """
    if config.type == "ollama":
      return OllamaClient(
        clientConfig=config
      )
    else:
      raise ValueError(f"Unsupported LLM provider: {config.type}")


def get_llm_factory(
    config_manager: ConfigManager = Depends(get_config_manager)
) -> LlmFactory:
    """FastAPI dependency for LlmFactory.
    
    Creates factory instance with current LLM configuration.
    Config is reloaded on each request for dynamic updates.
    """
    return LlmFactory()

# Type alias for cleaner endpoint signatures
LlmFactoryDep = Annotated[LlmFactory, Depends(get_llm_factory)]