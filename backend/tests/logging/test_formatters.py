import pytest
import json
import logging
from datetime import datetime

from src.logging.formatters import JSONFormatter, TextFormatter


class TestJSONFormatter:
    """Test suite for JSONFormatter"""

    def test_basic_log_formatting(self):
        """Test basic log record formatting to JSON"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=42,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        record.funcName = "test_function"
        record.module = "test_module"

        result = formatter.format(record)
        data = json.loads(result)

        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert data["message"] == "Test message"
        assert data["module"] == "test_module"
        assert data["function"] == "test_function"
        assert data["line"] == 42
        assert "timestamp" in data

    def test_timestamp_format(self):
        """Test that timestamp is in ISO format"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )

        result = formatter.format(record)
        data = json.loads(result)

        # Should be valid ISO format
        timestamp = datetime.fromisoformat(data["timestamp"])
        assert isinstance(timestamp, datetime)

    def test_exception_logging(self):
        """Test that exceptions are included in output"""
        formatter = JSONFormatter()

        try:
            raise ValueError("Test error")
        except ValueError:
            import sys

            exc_info = sys.exc_info()
            record = logging.LogRecord(
                name="test",
                level=logging.ERROR,
                pathname="/test/file.py",
                lineno=1,
                msg="Error occurred",
                args=(),
                exc_info=exc_info,
            )

            result = formatter.format(record)
            data = json.loads(result)

            assert "exception" in data
            assert "ValueError: Test error" in data["exception"]
            assert "Traceback" in data["exception"]

    def test_custom_fields(self):
        """Test that custom fields are included"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Test",
            args=(),
            exc_info=None,
        )
        # Add custom fields
        record.user_id = "user123"
        record.request_id = "req456"

        result = formatter.format(record)
        data = json.loads(result)

        assert data["user_id"] == "user123"
        assert data["request_id"] == "req456"

    def test_message_with_args(self):
        """Test lazy formatting with args"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="User %s logged in from %s",
            args=("john", "192.168.1.1"),
            exc_info=None,
        )

        result = formatter.format(record)
        data = json.loads(result)

        assert data["message"] == "User john logged in from 192.168.1.1"

    def test_json_output_is_valid(self):
        """Test that output is always valid JSON"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        result = formatter.format(record)

        # Should not raise exception
        data = json.loads(result)
        assert isinstance(data, dict)

    def test_extra_fields_attribute(self):
        """Test that extra_fields attribute is merged into JSON output"""
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        # Add extra_fields attribute
        record.extra_fields = {
            "request_id": "abc123",
            "user_id": "user456",
            "environment": "production",
        }

        result = formatter.format(record)
        data = json.loads(result)

        assert data["request_id"] == "abc123"
        assert data["user_id"] == "user456"
        assert data["environment"] == "production"

    def test_non_serializable_objects(self):
        """Test handling of non-JSON-serializable objects using default=str"""
        formatter = JSONFormatter()

        # Create a non-serializable object
        class CustomObject:
            def __str__(self):
                return "CustomObject instance"

        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        # Add non-serializable field
        record.custom_obj = CustomObject()

        result = formatter.format(record)
        data = json.loads(result)

        # Should fallback to str() representation
        assert "custom_obj" in data
        assert "CustomObject instance" in data["custom_obj"]

    def test_all_log_levels(self):
        """Test that all log levels are formatted correctly"""
        formatter = JSONFormatter()
        levels = [
            (logging.DEBUG, "DEBUG"),
            (logging.INFO, "INFO"),
            (logging.WARNING, "WARNING"),
            (logging.ERROR, "ERROR"),
            (logging.CRITICAL, "CRITICAL"),
        ]

        for level_num, level_name in levels:
            record = logging.LogRecord(
                name="test",
                level=level_num,
                pathname="/test/file.py",
                lineno=1,
                msg=f"Test {level_name} message",
                args=(),
                exc_info=None,
            )

            result = formatter.format(record)
            data = json.loads(result)

            assert data["level"] == level_name
            assert data["message"] == f"Test {level_name} message"

    def test_empty_and_none_messages(self):
        """Test edge cases with empty or None-like messages"""
        formatter = JSONFormatter()

        # Test empty string message
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="",
            args=(),
            exc_info=None,
        )

        result = formatter.format(record)
        data = json.loads(result)

        assert data["message"] == ""
        assert "level" in data
        assert "timestamp" in data

        # Test message with only whitespace
        record2 = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="   ",
            args=(),
            exc_info=None,
        )

        result2 = formatter.format(record2)
        data2 = json.loads(result2)

        assert data2["message"] == "   "


class TestTextFormatter:
    """Test suite for TextFormatter"""

    def test_basic_formatting(self):
        """Test basic text formatting"""
        formatter = TextFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=42,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        result = formatter.format(record)

        assert "INFO" in result
        assert "test.logger" in result
        assert "Test message" in result
        assert "[" in result  # Timestamp brackets

    def test_format_structure(self):
        """Test that format follows expected structure"""
        formatter = TextFormatter()
        record = logging.LogRecord(
            name="ai_assistant.config",
            level=logging.WARNING,
            pathname="/test/file.py",
            lineno=1,
            msg="Warning message",
            args=(),
            exc_info=None,
        )

        result = formatter.format(record)

        # Format: [timestamp] [level] [logger] message
        parts = result.split("]")
        assert len(parts) >= 3  # At least timestamp, level, logger
        assert "WARNING" in result
        assert "ai_assistant.config" in result
        assert "Warning message" in result

    def test_message_with_args(self):
        """Test lazy formatting with args"""
        formatter = TextFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="/test/file.py",
            lineno=1,
            msg="Processing %d items",
            args=(42,),
            exc_info=None,
        )

        result = formatter.format(record)

        assert "Processing 42 items" in result

    def test_exception_logging(self):
        """Test that exceptions are formatted correctly in text output"""
        formatter = TextFormatter()

        try:
            raise RuntimeError("Test runtime error")
        except RuntimeError:
            import sys

            exc_info = sys.exc_info()
            record = logging.LogRecord(
                name="test.logger",
                level=logging.ERROR,
                pathname="/test/file.py",
                lineno=100,
                msg="An error occurred",
                args=(),
                exc_info=exc_info,
            )

            result = formatter.format(record)

            # Should contain basic log info
            assert "ERROR" in result
            assert "test.logger" in result
            assert "An error occurred" in result
            # Should contain exception info
            assert "RuntimeError: Test runtime error" in result
            assert "Traceback" in result
