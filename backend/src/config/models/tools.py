from typing import Annotated, ClassVar, Any, Union
from pydantic import Field, model_validator, Tag
from .base import BaseConfig
from .builtin_tools import BaseToolConfig, GitToolConfig, GmailToolConfig, ShellToolConfig


# Discriminated union using the 'type' field
# Only built-in tools (gmail, shell, git) are currently supported
ToolConfig = Annotated[
    Union[
        Annotated[GmailToolConfig, Tag("gmail")],
        Annotated[ShellToolConfig, Tag("shell")],
        Annotated[GitToolConfig, Tag("git")],
    ],
    Field(discriminator="type"),
]

class ToolsConfig(BaseConfig):
    """
    Configuration for tools available to the AI Assistant
    
    This model manages the configuration of all available tools,
    including built-in tools (Gmail, Shell, Git) and user-installed tools.
    Each tool instance has a unique ID and can be enabled/disabled independently.
    
    Tools are stored as a dict keyed by tool ID for O(1) lookup performance.
    In YAML config, tools are defined as a list and automatically converted to dict.
    """

    # Changes to tool configuration do NOT require restart
    requires_restart: ClassVar[bool] = False

    tools: dict[str, ToolConfig] = Field(default_factory=dict)

    @model_validator(mode='before')
    @classmethod
    def convert_list_to_dict(cls, data: Any) -> Any:
        """Convert tools list from YAML to dict keyed by ID"""
        if isinstance(data, dict) and 'tools' in data:
            tools = data['tools']
            
            # If already a dict, return as-is
            if isinstance(tools, dict):
                return data
            
            # If a list, convert to dict keyed by ID
            if isinstance(tools, list):
                tools_dict = {}
                seen_ids = set()
                
                for tool in tools:
                    tool_id = tool.get('id') if isinstance(tool, dict) else getattr(tool, 'id', None)
                    
                    if not tool_id:
                        raise ValueError(f"Tool configuration missing 'id' field: {tool}")
                    
                    if tool_id in seen_ids:
                        raise ValueError(f"Duplicate tool ID: '{tool_id}'")
                    
                    seen_ids.add(tool_id)
                    tools_dict[tool_id] = tool
                
                data['tools'] = tools_dict
        
        return data

    def get_tool_by_id(self, tool_id: str) -> ToolConfig | None:
        """Get tool configuration by ID (O(1) lookup)"""
        return self.tools.get(tool_id)

    def get_enabled_tools(self) -> dict[str, ToolConfig]:
        """Get all enabled tools"""
        return {tool_id: tool for tool_id, tool in self.tools.items() if tool.enabled}

    def get_tools_by_type(self, tool_type: str) -> dict[str, ToolConfig]:
        """Get all tools of a specific type"""
        return {tool_id: tool for tool_id, tool in self.tools.items() if tool.type == tool_type}

