"""Tests for ToolsConfig model."""
import pytest
from pydantic import ValidationError
from src.config.models.tools import ToolsConfig
from src.config.models.builtin_tools import (
    GmailToolConfig,
    ShellToolConfig,
    GitToolConfig,
)


class TestToolsConfigListToDictConversion:
    """Test suite for list-to-dict conversion in ToolsConfig."""

    def test_converts_list_to_dict_by_id(self):
        """Should convert tools list to dict keyed by tool ID."""
        data = {
            "tools": [
                {"id": "shell", "type": "shell", "enabled": True, "config": {}},
                {"id": "git", "type": "git", "enabled": False, "config": {}},
            ]
        }
        
        config = ToolsConfig(**data)
        
        assert isinstance(config.tools, dict)
        assert "shell" in config.tools
        assert "git" in config.tools
        assert config.tools["shell"].id == "shell"
        assert config.tools["git"].id == "git"

    def test_accepts_dict_input_unchanged(self):
        """Should accept dict input without conversion."""
        data = {
            "tools": {
                "shell": {"id": "shell", "type": "shell", "enabled": True, "config": {}},
                "git": {"id": "git", "type": "git", "enabled": False, "config": {}},
            }
        }
        
        config = ToolsConfig(**data)
        
        assert isinstance(config.tools, dict)
        assert "shell" in config.tools
        assert "git" in config.tools

    def test_rejects_tool_without_id(self):
        """Should raise error if tool is missing ID field."""
        data = {
            "tools": [
                {"type": "shell", "enabled": True, "config": {}},  # Missing 'id'
            ]
        }
        
        with pytest.raises(ValueError, match="Tool configuration missing 'id' field"):
            ToolsConfig(**data)

    def test_rejects_duplicate_tool_ids(self):
        """Should raise error if multiple tools have same ID."""
        data = {
            "tools": [
                {"id": "shell", "type": "shell", "enabled": True, "config": {}},
                {"id": "shell", "type": "shell", "enabled": False, "config": {}},  # Duplicate
            ]
        }
        
        with pytest.raises(ValueError, match="Duplicate tool ID: 'shell'"):
            ToolsConfig(**data)

    def test_handles_empty_tools_list(self):
        """Should handle empty tools list."""
        data = {"tools": []}
        
        config = ToolsConfig(**data)
        
        assert config.tools == {}

    def test_handles_empty_tools_dict(self):
        """Should handle empty tools dict."""
        data = {"tools": {}}
        
        config = ToolsConfig(**data)
        
        assert config.tools == {}


class TestToolsConfigValidation:
    """Test suite for tool configuration validation."""

    def test_validates_gmail_tool_config(self):
        """Should validate Gmail tool configuration."""
        data = {
            "tools": [
                {
                    "id": "gmail-personal",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 993,
                        "credentials_env_prefix": "GMAIL_",
                        "max_fetch_limit": 50,
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        tool = config.tools["gmail-personal"]
        
        assert isinstance(tool, GmailToolConfig)
        assert tool.config.imap_host == "imap.gmail.com"
        assert tool.config.imap_port == 993
        assert tool.config.credentials_env_prefix == "GMAIL_"
        assert tool.config.max_fetch_limit == 50
        assert tool.config.operation_mode == "recommend"  # Default

    def test_validates_shell_tool_config(self):
        """Should validate Shell tool configuration."""
        data = {
            "tools": [
                {
                    "id": "shell",
                    "type": "shell",
                    "enabled": True,
                    "config": {
                        "timeout_seconds": 30,
                        "require_approval": True,
                        "use_shell": False,
                        "whitelisted_commands": [],
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        tool = config.tools["shell"]
        
        assert isinstance(tool, ShellToolConfig)
        assert tool.config.timeout_seconds == 30
        assert tool.config.require_approval is True
        assert tool.config.use_shell is False

    def test_validates_git_tool_config(self):
        """Should validate Git tool configuration."""
        data = {
            "tools": [
                {
                    "id": "git",
                    "type": "git",
                    "enabled": True,
                    "config": {
                        "default_repos": ["~/projects/main", "~/projects/tools"]
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        tool = config.tools["git"]
        
        assert isinstance(tool, GitToolConfig)
        assert tool.config.default_repos == ["~/projects/main", "~/projects/tools"]

    def test_rejects_invalid_gmail_host(self):
        """Should reject Gmail config with invalid hostname pattern."""
        data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "invalid host!",  # Invalid characters
                        "imap_port": 993,
                        "credentials_env_prefix": "GMAIL_",
                    }
                }
            ]
        }
        
        with pytest.raises(ValidationError):
            ToolsConfig(**data)

    def test_rejects_invalid_port_range(self):
        """Should reject port outside valid range."""
        data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 99999,  # Invalid port
                        "credentials_env_prefix": "GMAIL_",
                    }
                }
            ]
        }
        
        with pytest.raises(ValidationError):
            ToolsConfig(**data)

    def test_rejects_invalid_timeout(self):
        """Should reject timeout outside valid range."""
        data = {
            "tools": [
                {
                    "id": "shell",
                    "type": "shell",
                    "enabled": True,
                    "config": {
                        "timeout_seconds": 5000,  # Exceeds max 3600
                    }
                }
            ]
        }
        
        with pytest.raises(ValidationError):
            ToolsConfig(**data)


class TestToolsConfigHelperMethods:
    """Test suite for ToolsConfig helper methods."""

    @pytest.fixture
    def sample_config(self):
        """Create sample configuration for testing."""
        return ToolsConfig(**{
            "tools": [
                {"id": "shell", "type": "shell", "enabled": True, "config": {}},
                {"id": "git", "type": "git", "enabled": True, "config": {}},
                {"id": "gmail-1", "type": "gmail", "enabled": True, "config": {
                    "imap_host": "imap.gmail.com",
                    "imap_port": 993,
                    "credentials_env_prefix": "GMAIL1_",
                }},
                {"id": "gmail-2", "type": "gmail", "enabled": False, "config": {
                    "imap_host": "imap.gmail.com",
                    "imap_port": 993,
                    "credentials_env_prefix": "GMAIL2_",
                }},
            ]
        })

    def test_get_tool_by_id_returns_tool(self, sample_config):
        """Should return tool by ID."""
        tool = sample_config.get_tool_by_id("shell")
        
        assert tool is not None
        assert tool.id == "shell"
        assert tool.type == "shell"

    def test_get_tool_by_id_returns_none_for_missing(self, sample_config):
        """Should return None for non-existent tool ID."""
        tool = sample_config.get_tool_by_id("nonexistent")
        
        assert tool is None

    def test_get_enabled_tools_filters_correctly(self, sample_config):
        """Should return only enabled tools."""
        enabled = sample_config.get_enabled_tools()
        
        assert len(enabled) == 3
        assert "shell" in enabled
        assert "git" in enabled
        assert "gmail-1" in enabled
        assert "gmail-2" not in enabled

    def test_get_tools_by_type_filters_correctly(self, sample_config):
        """Should return all tools of specific type."""
        gmail_tools = sample_config.get_tools_by_type("gmail")
        
        assert len(gmail_tools) == 2
        assert "gmail-1" in gmail_tools
        assert "gmail-2" in gmail_tools

    def test_get_tools_by_type_returns_empty_for_missing(self, sample_config):
        """Should return empty dict for non-existent type."""
        tools = sample_config.get_tools_by_type("nonexistent")
        
        assert tools == {}


class TestToolsConfigDefaults:
    """Test suite for ToolsConfig default values."""

    def test_default_tools_is_empty_dict(self):
        """Should default to empty dict if no tools specified."""
        config = ToolsConfig()
        
        assert config.tools == {}

    def test_requires_restart_is_false(self):
        """Should not require restart for tool config changes."""
        assert ToolsConfig.requires_restart is False

    def test_tool_enabled_defaults_to_true(self):
        """Should default tool enabled status to True."""
        data = {
            "tools": [
                {"id": "shell", "type": "shell", "config": {}},  # No 'enabled' field
            ]
        }
        
        config = ToolsConfig(**data)
        
        assert config.tools["shell"].enabled is True


class TestWhitelistedCommandModel:
    """Test suite for WhitelistedCommand model used in ShellConfig."""

    def test_accepts_command_with_args(self):
        """Should accept whitelisted command with arguments."""
        data = {
            "tools": [
                {
                    "id": "shell",
                    "type": "shell",
                    "enabled": True,
                    "config": {
                        "whitelisted_commands": [
                            {"command": "ls", "args": ["-la"]},
                            {"command": "/usr/bin/git", "args": ["status", "--short"]},
                        ]
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        commands = config.tools["shell"].config.whitelisted_commands
        
        assert len(commands) == 2
        assert commands[0].command == "ls"
        assert commands[0].args == ["-la"]
        assert commands[1].command == "/usr/bin/git"
        assert commands[1].args == ["status", "--short"]

    def test_accepts_command_without_args(self):
        """Should accept whitelisted command without arguments."""
        data = {
            "tools": [
                {
                    "id": "shell",
                    "type": "shell",
                    "enabled": True,
                    "config": {
                        "whitelisted_commands": [
                            {"command": "pwd"},
                        ]
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        commands = config.tools["shell"].config.whitelisted_commands
        
        assert len(commands) == 1
        assert commands[0].command == "pwd"
        assert commands[0].args == []


class TestGmailConfigEnhancements:
    """Test suite for enhanced Gmail configuration fields."""

    def test_defaults_for_optional_fields(self):
        """Should provide sensible defaults for optional Gmail fields."""
        data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 993,
                        "credentials_env_prefix": "GMAIL_",
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        gmail = config.tools["gmail"].config
        
        assert gmail.recommendation_types == ["summary", "labels", "duplicates", "spam"]
        assert gmail.confidence_threshold == 60
        assert gmail.batch_similar is True

    def test_accepts_custom_recommendation_types(self):
        """Should accept custom recommendation types."""
        data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 993,
                        "credentials_env_prefix": "GMAIL_",
                        "recommendation_types": ["summary", "labels"],
                        "confidence_threshold": 80,
                        "batch_similar": False,
                    }
                }
            ]
        }
        
        config = ToolsConfig(**data)
        gmail = config.tools["gmail"].config
        
        assert gmail.recommendation_types == ["summary", "labels"]
        assert gmail.confidence_threshold == 80
        assert gmail.batch_similar is False

    def test_validates_credentials_env_prefix_pattern(self):
        """Should validate credentials_env_prefix matches expected pattern."""
        # Valid pattern
        data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 993,
                        "credentials_env_prefix": "MY_GMAIL_",
                    }
                }
            ]
        }
        config = ToolsConfig(**data)
        assert config.tools["gmail"].config.credentials_env_prefix == "MY_GMAIL_"

        # Invalid pattern (lowercase)
        invalid_data = {
            "tools": [
                {
                    "id": "gmail",
                    "type": "gmail",
                    "enabled": True,
                    "config": {
                        "imap_host": "imap.gmail.com",
                        "imap_port": 993,
                        "credentials_env_prefix": "gmail_",  # Should be uppercase
                    }
                }
            ]
        }
        with pytest.raises(ValidationError):
            ToolsConfig(**invalid_data)
