from pydantic import BaseModel, Field
from typing import Literal
from .base import BaseToolConfig


class WhitelistedCommand(BaseModel):
    """Configuration for a whitelisted shell command.
    
    Whitelisted commands bypass approval requirements, allowing
    the AI to execute them directly. Use with caution.
    """
    
    command: str = Field(..., description="Command name or full path to executable")
    args: list[str] = Field(
        default_factory=list,
        description="Optional fixed arguments for the command",
    )


class ShellConfig(BaseModel):
    """Configuration for shell command execution tool.
    
    Provides secure command execution with approval workflows and
    optional whitelisting for trusted commands.
    """
    
    timeout_seconds: int = Field(
        30,
        ge=1,
        le=3600,
        description="Maximum command execution time in seconds",
    )
    require_approval: bool = Field(
        True,
        description="Require user approval before executing commands (recommended: True)",
    )
    use_shell: bool = Field(
        False,
        description="Enable shell interpretation (default: False for security)",
    )
    whitelisted_commands: list[WhitelistedCommand] = Field(
        default_factory=list,
        description="Commands that bypass approval (use sparingly for security)",
    )
    show_full_command: bool = Field(
        True,
        description="Display canonical command path in approval UI",
    )


class ShellToolConfig(BaseToolConfig):
    """Shell tool configuration with strict validation."""
    
    type: Literal["shell"] = "shell"
    config: ShellConfig