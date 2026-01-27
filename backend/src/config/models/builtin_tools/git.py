from pydantic import BaseModel, Field
from typing import Literal
from .base import BaseToolConfig


class GitConfig(BaseModel):
    """Configuration for Git repository operations tool.
    
    Provides integration with Git repositories for status checking,
    committing changes, and other repository operations.
    """
    
    default_repos: list[str] = Field(
        default_factory=list,
        description="List of default repository paths (can use ~ for home directory)",
    )


class GitToolConfig(BaseToolConfig):
    """Git tool configuration with strict validation."""
    
    type: Literal["git"] = "git"
    config: GitConfig
