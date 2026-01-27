from pydantic import BaseModel, Field
from typing import Any


class BaseToolConfig(BaseModel):
    """Base configuration model for all tools.
    
    All tool configurations must inherit from this base class and provide
    a unique ID, tool type, and enabled status.
    """
    
    id: str = Field(..., description="Unique identifier for this tool instance")
    type: str = Field(..., description="Tool type (matches tool module name)")
    enabled: bool = Field(True, description="Whether tool is enabled and available for use")
    config: dict[str, Any] = Field(default_factory=dict, description="Tool-specific configuration")