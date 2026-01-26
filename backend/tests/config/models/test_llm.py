"""
Tests for LLM configuration models
"""

import os
import pytest
from pydantic import ValidationError
from src.config.models.llm import (
    AnthropicConfig,
    OpenAIConfig,
    OllamaConfig,
    LLMConfig,
    ContextOverflowStrategy,
)


class TestAnthropicConfigAPIKeyValidation:
    """Tests for API key environment variable validation in AnthropicConfig"""

    def test_api_key_env_warns_if_not_set(self, monkeypatch):
        """Should warn but not fail if API key env var is not set"""
        # Ensure the env var doesn't exist
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        # Validator is called when field is explicitly provided
        with pytest.warns(
            UserWarning, match="API key environment variable 'ANTHROPIC_API_KEY' is not set"
        ):
            config = AnthropicConfig(api_key_env="ANTHROPIC_API_KEY")

        # Should still create the config successfully
        assert config.api_key_env == "ANTHROPIC_API_KEY"

    def test_api_key_env_no_warning_if_set(self, monkeypatch):
        """Should not warn if API key env var is set"""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test123")

        # Should not raise any warnings (using warnings.catch_warnings)
        import warnings
        with warnings.catch_warnings(record=True) as warning_list:
            warnings.simplefilter("always")
            config = AnthropicConfig(api_key_env="ANTHROPIC_API_KEY")

        assert len(warning_list) == 0
        assert config.api_key_env == "ANTHROPIC_API_KEY"

    def test_custom_api_key_env_name_warns_if_not_set(self, monkeypatch):
        """Should validate custom env var names"""
        monkeypatch.delenv("MY_CUSTOM_ANTHROPIC_KEY", raising=False)

        with pytest.warns(
            UserWarning,
            match="API key environment variable 'MY_CUSTOM_ANTHROPIC_KEY' is not set",
        ):
            config = AnthropicConfig(api_key_env="MY_CUSTOM_ANTHROPIC_KEY")

        assert config.api_key_env == "MY_CUSTOM_ANTHROPIC_KEY"

    def test_custom_api_key_env_name_no_warning_if_set(self, monkeypatch):
        """Should not warn if custom env var is set"""
        monkeypatch.setenv("MY_CUSTOM_KEY", "test-value")

        import warnings
        with warnings.catch_warnings(record=True) as warning_list:
            warnings.simplefilter("always")
            config = AnthropicConfig(api_key_env="MY_CUSTOM_KEY")

        assert len(warning_list) == 0
        assert config.api_key_env == "MY_CUSTOM_KEY"


class TestOpenAIConfigAPIKeyValidation:
    """Tests for API key environment variable validation in OpenAIConfig"""

    def test_api_key_env_warns_if_not_set(self, monkeypatch):
        """Should warn but not fail if API key env var is not set"""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)

        with pytest.warns(
            UserWarning, match="API key environment variable 'OPENAI_API_KEY' is not set"
        ):
            config = OpenAIConfig(api_key_env="OPENAI_API_KEY")

        assert config.api_key_env == "OPENAI_API_KEY"

    def test_api_key_env_no_warning_if_set(self, monkeypatch):
        """Should not warn if API key env var is set"""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test123")

        import warnings
        with warnings.catch_warnings(record=True) as warning_list:
            warnings.simplefilter("always")
            config = OpenAIConfig(api_key_env="OPENAI_API_KEY")

        assert len(warning_list) == 0
        assert config.api_key_env == "OPENAI_API_KEY"


class TestAnthropicConfigInheritance:
    """Tests for inherited behavior from LLMConfigBase in AnthropicConfig"""

    def test_temperature_inherited_from_base(self):
        """Should inherit temperature validation from LLMConfigBase"""
        # Should accept valid temperature
        config = AnthropicConfig(temperature=1.5)
        assert config.temperature == 1.5

        # Should reject invalid temperature (> 2.0)
        with pytest.raises(ValidationError) as exc_info:
            AnthropicConfig(temperature=3.0)
        assert "less than or equal to 2" in str(exc_info.value)

        # Should reject invalid temperature (< 0.0)
        with pytest.raises(ValidationError) as exc_info:
            AnthropicConfig(temperature=-0.5)
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_context_overflow_strategy_inherited(self):
        """Should inherit context overflow strategy from base"""
        # Default should be SUMMARIZE
        config = AnthropicConfig()
        assert config.context_overflow_strategy == ContextOverflowStrategy.SUMMARIZE

        # Should accept valid enum value
        config2 = AnthropicConfig(context_overflow_strategy="truncate")
        assert config2.context_overflow_strategy == ContextOverflowStrategy.TRUNCATE

        # Should accept enum member directly
        config3 = AnthropicConfig(
            context_overflow_strategy=ContextOverflowStrategy.SUMMARIZE
        )
        assert config3.context_overflow_strategy == ContextOverflowStrategy.SUMMARIZE

    def test_context_limits_inherited_with_validation(self):
        """Should inherit context limit validations from base"""
        # max_context_activities must be >= 1
        with pytest.raises(ValidationError) as exc_info:
            AnthropicConfig(max_context_activities=0)
        assert "greater than or equal to 1" in str(exc_info.value)

        # max_context_tokens must be >= 100
        with pytest.raises(ValidationError) as exc_info:
            AnthropicConfig(max_context_tokens=50)
        assert "greater than or equal to 100" in str(exc_info.value)

        # max_tool_definition_tokens must be >= 50
        with pytest.raises(ValidationError) as exc_info:
            AnthropicConfig(max_tool_definition_tokens=10)
        assert "greater than or equal to 50" in str(exc_info.value)


class TestOpenAIConfigInheritance:
    """Tests for inherited behavior from LLMConfigBase in OpenAIConfig"""

    def test_temperature_inherited_from_base(self):
        """Should inherit temperature validation from LLMConfigBase"""
        # Should accept valid temperature
        config = OpenAIConfig(temperature=0.5)
        assert config.temperature == 0.5

        # Should reject invalid temperature (> 2.0)
        with pytest.raises(ValidationError) as exc_info:
            OpenAIConfig(temperature=2.5)
        assert "less than or equal to 2" in str(exc_info.value)

        # Should reject invalid temperature (< 0.0)
        with pytest.raises(ValidationError) as exc_info:
            OpenAIConfig(temperature=-1.0)
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_context_overflow_strategy_inherited(self):
        """Should inherit context overflow strategy from base"""
        config = OpenAIConfig()
        assert config.context_overflow_strategy == ContextOverflowStrategy.SUMMARIZE

        config2 = OpenAIConfig(context_overflow_strategy="truncate")
        assert config2.context_overflow_strategy == ContextOverflowStrategy.TRUNCATE


class TestOllamaConfigInheritance:
    """Tests for inherited behavior from LLMConfigBase in OllamaConfig"""

    def test_temperature_inherited_from_base(self):
        """Should inherit temperature validation from LLMConfigBase"""
        # Should accept valid temperature
        config = OllamaConfig(temperature=0.9)
        assert config.temperature == 0.9

        # Should reject invalid temperature (> 2.0)
        with pytest.raises(ValidationError) as exc_info:
            OllamaConfig(temperature=2.1)
        assert "less than or equal to 2" in str(exc_info.value)

        # Should reject invalid temperature (< 0.0)
        with pytest.raises(ValidationError) as exc_info:
            OllamaConfig(temperature=-0.1)
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_context_overflow_strategy_inherited(self):
        """Should inherit context overflow strategy from base"""
        config = OllamaConfig()
        assert config.context_overflow_strategy == ContextOverflowStrategy.SUMMARIZE

        config2 = OllamaConfig(context_overflow_strategy="truncate")
        assert config2.context_overflow_strategy == ContextOverflowStrategy.TRUNCATE
