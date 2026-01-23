import pytest
from pathlib import Path
from pydantic import ValidationError

from src.config.models.logging import LoggingConfig


class TestLoggingConfig:
    """Test suite for LoggingConfig model"""

    def test_default_values(self):
        """Test that default values are set correctly"""
        config = LoggingConfig()

        assert config.level == "INFO"
        assert config.format == "json"
        assert config.enable_file_logging is True
        assert config.log_file == "~/.config/ai-assistant/logs/app.log"
        assert config.max_bytes == 10_485_760  # 10 MB
        assert config.backup_count == 5
        assert config.enable_console_logging is True
        assert config.console_level is None
        assert config.enable_otel is False
        assert config.otel_endpoint is None
        assert config.otel_service_name == "ai-assistant"
        assert config.module_levels == {}
        assert config.enable_http_logging is True
        assert config.log_request_body is False
        assert config.log_response_body is False
        assert config.exclude_paths == ["/health"]

    def test_valid_log_levels(self):
        """Test that all valid log levels are accepted"""
        valid_levels = ["DEBUG", "HTTP", "INFO", "WARNING", "ERROR", "CRITICAL"]

        for level in valid_levels:
            config = LoggingConfig(level=level)
            assert config.level == level

    def test_invalid_log_level(self):
        """Test that invalid log levels are rejected"""
        with pytest.raises(ValidationError) as exc_info:
            LoggingConfig(level="INVALID")

        assert "level" in str(exc_info.value)

    def test_valid_formats(self):
        """Test that valid formats are accepted"""
        for fmt in ["json", "text"]:
            config = LoggingConfig(format=fmt)
            assert config.format == fmt

    def test_invalid_format(self):
        """Test that invalid formats are rejected"""
        with pytest.raises(ValidationError) as exc_info:
            LoggingConfig(format="xml")

        assert "format" in str(exc_info.value)

    def test_log_file_path_expansion(self):
        """Test that log file path with ~ is expanded"""
        config = LoggingConfig(log_file="~/test/app.log")

        # Should expand ~ to home directory
        assert not config.log_file.startswith("~")
        assert str(Path.home()) in config.log_file

    def test_log_file_absolute_path(self):
        """Test that absolute paths are preserved"""
        abs_path = "/var/log/ai-assistant/app.log"
        config = LoggingConfig(log_file=abs_path)

        assert config.log_file == abs_path

    def test_custom_console_level(self):
        """Test setting custom console level"""
        config = LoggingConfig(level="INFO", console_level="WARNING")

        assert config.level == "INFO"
        assert config.console_level == "WARNING"

    def test_otel_configuration(self):
        """Test OpenTelemetry configuration"""
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_service_name="test-service",
        )

        assert config.enable_otel is True
        assert config.otel_endpoint == "http://localhost:4317"
        assert config.otel_service_name == "test-service"

    def test_module_levels(self):
        """Test module-specific log levels"""
        module_levels = {
            "ai_assistant.llm": "DEBUG",
            "ai_assistant.config": "WARNING",
        }
        config = LoggingConfig(module_levels=module_levels)

        assert config.module_levels == module_levels

    def test_http_logging_configuration(self):
        """Test HTTP logging middleware configuration"""
        config = LoggingConfig(
            enable_http_logging=True,
            log_request_body=True,
            log_response_body=True,
            exclude_paths=["/health", "/metrics"],
        )

        assert config.enable_http_logging is True
        assert config.log_request_body is True
        assert config.log_response_body is True
        assert config.exclude_paths == ["/health", "/metrics"]

    def test_rotation_settings(self):
        """Test log rotation settings"""
        config = LoggingConfig(max_bytes=5_242_880, backup_count=10)

        assert config.max_bytes == 5_242_880  # 5 MB
        assert config.backup_count == 10

    def test_model_dump(self):
        """Test that model can be serialized to dict"""
        config = LoggingConfig(level="DEBUG", format="text")
        data = config.model_dump()

        assert isinstance(data, dict)
        assert data["level"] == "DEBUG"
        assert data["format"] == "text"

    def test_model_json_schema(self):
        """Test that model has valid JSON schema"""
        schema = LoggingConfig.model_json_schema()

        assert "properties" in schema
        assert "level" in schema["properties"]
        assert "format" in schema["properties"]

