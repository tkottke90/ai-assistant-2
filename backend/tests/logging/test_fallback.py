import pytest
import time
import threading
from unittest.mock import MagicMock, patch
from collections import deque

from src.logging.fallback import (
    safe_log,
    safe_info,
    safe_warning,
    safe_error,
    replay_and_disable,
    get_buffer_snapshot,
    _now_iso,
    _print_stderr,
)


class TestHelperFunctions:
    """Test suite for internal helper functions"""

    def test_now_iso_with_timestamp(self):
        """Verify _now_iso formats provided timestamp correctly"""
        ts = 1706000000.0  # Known timestamp: 2024-01-23
        result = _now_iso(ts)
        
        # Should be in format YYYY-MM-DDTHH:MM:SS
        assert len(result) == 19
        assert "T" in result
        assert result[4] == "-"
        assert result[7] == "-"
        assert result[10] == "T"
        assert result[13] == ":"
        assert result[16] == ":"

    def test_now_iso_without_timestamp(self):
        """Verify _now_iso uses current time when no timestamp provided"""
        before = time.time()
        result = _now_iso()
        after = time.time()
        
        # Should be in format YYYY-MM-DDTHH:MM:SS
        assert len(result) == 19
        assert "T" in result
        
        # Should be close to current time
        # Parse back to verify it's a reasonable timestamp
        assert result.startswith("202")  # Year should be 202x

    def test_print_stderr(self, capsys):
        """Verify _print_stderr formats and prints correctly"""
        _print_stderr("INFO", "test.logger", "test message", 1706000000.0)
        captured = capsys.readouterr()
        
        assert "INFO" in captured.err
        assert "test.logger" in captured.err
        assert "test message" in captured.err
        assert "[" in captured.err  # Should have bracket formatting


class TestSafeLog:
    """Test suite for safe_log function"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_safe_log_buffers_message(self):
        """Verify safe_log buffers messages before replay"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test message", {"key": "value"}, "test.logger")
        
        assert len(fb._buffer) == 1
        level, msg, extra, ts = fb._buffer[0]
        assert level == "INFO"
        assert msg == "test message"
        assert extra == {"key": "value"}
        assert isinstance(ts, float)
        assert ts > 0

    def test_safe_log_with_none_extra(self):
        """Verify safe_log handles None extra dict"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test", None, "logger")
        
        assert len(fb._buffer) == 1
        _, _, extra, _ = fb._buffer[0]
        assert extra == {}

    def test_safe_log_prints_to_stderr(self, capsys):
        """Verify safe_log prints to stderr for immediate visibility"""
        safe_log("WARNING", "important message", None, "startup.logger")
        
        captured = capsys.readouterr()
        assert "WARNING" in captured.err
        assert "important message" in captured.err
        assert "startup.logger" in captured.err

    def test_safe_log_swallows_print_errors(self, monkeypatch):
        """Verify safe_log doesn't fail if stderr printing fails"""
        def mock_print_stderr(*args):
            raise IOError("stderr unavailable")
        
        monkeypatch.setattr("src.logging.fallback._print_stderr", mock_print_stderr)
        
        # Should not raise
        safe_log("INFO", "test message")
        
        # Should still buffer the message
        import src.logging.fallback as fb
        assert len(fb._buffer) == 1

    def test_safe_log_swallows_buffer_errors(self, monkeypatch):
        """Verify safe_log doesn't fail if buffering fails"""
        import src.logging.fallback as fb
        
        # Make buffer.append fail
        original_buffer = fb._buffer
        mock_buffer = MagicMock()
        mock_buffer.append.side_effect = RuntimeError("Buffer full")
        fb._buffer = mock_buffer
        
        try:
            # Should not raise
            safe_log("INFO", "test message")
        finally:
            fb._buffer = original_buffer

    def test_safe_log_forwards_when_disabled(self):
        """Verify safe_log forwards to real logger after replay_and_disable"""
        import src.logging.fallback as fb
        fb._enabled = False  # Simulate post-replay state
        
        mock_logger = MagicMock()
        fb._forward_getter = lambda name: mock_logger
        
        safe_log("INFO", "forwarded message", {"extra": "data"}, "test.logger")
        
        # Should have called real logger's info method
        mock_logger.info.assert_called_once_with("forwarded message", extra={"extra": "data"})

    def test_safe_log_forwarding_swallows_errors(self):
        """Verify forwarding errors don't break application"""
        import src.logging.fallback as fb
        fb._enabled = False
        fb._forward_getter = lambda name: MagicMock(info=MagicMock(side_effect=Exception("forward fail")))
        
        # Should not raise
        safe_log("INFO", "test")

    def test_safe_log_uses_correct_log_level_method(self):
        """Verify safe_log calls the correct method based on level"""
        import src.logging.fallback as fb
        fb._enabled = False
        
        mock_logger = MagicMock()
        fb._forward_getter = lambda name: mock_logger
        
        # Test different levels
        safe_log("DEBUG", "debug msg", None, "logger")
        mock_logger.debug.assert_called_once()
        
        safe_log("WARNING", "warning msg", None, "logger")
        mock_logger.warning.assert_called_once()
        
        safe_log("ERROR", "error msg", None, "logger")
        mock_logger.error.assert_called_once()

    def test_safe_log_is_thread_safe(self):
        """Verify safe_log can be called from multiple threads safely"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        
        errors = []
        
        def log_messages(thread_id):
            try:
                for i in range(50):
                    safe_log("INFO", f"Thread {thread_id} message {i}")
            except Exception as e:
                errors.append(e)
        
        threads = [threading.Thread(target=log_messages, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        # Should have no errors
        assert len(errors) == 0
        
        # Should have logged from all threads without data corruption
        # With maxlen=1000, we might lose some, but should have many
        assert len(fb._buffer) > 0
        assert len(fb._buffer) <= 1000


class TestConvenienceFunctions:
    """Test suite for safe_info, safe_warning, safe_error wrappers"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_safe_info_delegates_to_safe_log(self, monkeypatch):
        """Verify safe_info calls safe_log with INFO level"""
        mock_safe_log = MagicMock()
        monkeypatch.setattr("src.logging.fallback.safe_log", mock_safe_log)
        
        safe_info("info message", {"key": "val"}, "custom.logger")
        
        mock_safe_log.assert_called_once_with("INFO", "info message", {"key": "val"}, "custom.logger")

    def test_safe_info_uses_default_logger_name(self, monkeypatch):
        """Verify safe_info uses default logger name when not provided"""
        mock_safe_log = MagicMock()
        monkeypatch.setattr("src.logging.fallback.safe_log", mock_safe_log)
        
        safe_info("info message")
        
        mock_safe_log.assert_called_once_with("INFO", "info message", None, "ai_assistant.startup")

    def test_safe_warning_delegates_to_safe_log(self, monkeypatch):
        """Verify safe_warning calls safe_log with WARNING level"""
        mock_safe_log = MagicMock()
        monkeypatch.setattr("src.logging.fallback.safe_log", mock_safe_log)
        
        safe_warning("warning message")
        
        mock_safe_log.assert_called_once_with("WARNING", "warning message", None, "ai_assistant.startup")

    def test_safe_warning_with_extra_and_logger(self, monkeypatch):
        """Verify safe_warning passes through extra and logger_name"""
        mock_safe_log = MagicMock()
        monkeypatch.setattr("src.logging.fallback.safe_log", mock_safe_log)
        
        safe_warning("warning message", {"count": 3}, "my.logger")
        
        mock_safe_log.assert_called_once_with("WARNING", "warning message", {"count": 3}, "my.logger")

    def test_safe_error_delegates_to_safe_log(self, monkeypatch):
        """Verify safe_error calls safe_log with ERROR level"""
        mock_safe_log = MagicMock()
        monkeypatch.setattr("src.logging.fallback.safe_log", mock_safe_log)
        
        safe_error("error message")
        
        mock_safe_log.assert_called_once_with("ERROR", "error message", None, "ai_assistant.startup")

    def test_convenience_functions_actually_buffer(self):
        """Verify convenience functions actually buffer messages"""
        import src.logging.fallback as fb
        
        safe_info("info msg")
        safe_warning("warning msg")
        safe_error("error msg")
        
        assert len(fb._buffer) == 3
        assert fb._buffer[0][0] == "INFO"
        assert fb._buffer[1][0] == "WARNING"
        assert fb._buffer[2][0] == "ERROR"


class TestReplayAndDisable:
    """Test suite for replay_and_disable function"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_replay_and_disable_replays_buffered_messages(self):
        """Verify replay_and_disable sends all buffered messages to real logger"""
        import src.logging.fallback as fb
        
        # Add some buffered messages
        safe_log("INFO", "msg1", {"data": 1})
        safe_log("WARNING", "msg2", {"data": 2})
        safe_log("ERROR", "msg3", {"data": 3})
        
        assert len(fb._buffer) == 3
        
        mock_logger = MagicMock()
        get_logger_func = lambda name: mock_logger
        
        replay_and_disable(get_logger_func, "ai_assistant.startup")
        
        # Should have replayed all 3 messages
        assert mock_logger.info.call_count == 1
        assert mock_logger.warning.call_count == 1
        assert mock_logger.error.call_count == 1
        
        # Verify the actual messages and extras
        mock_logger.info.assert_called_with("msg1", extra={"data": 1})
        mock_logger.warning.assert_called_with("msg2", extra={"data": 2})
        mock_logger.error.assert_called_with("msg3", extra={"data": 3})
        
        # Buffer should be cleared
        assert len(fb._buffer) == 0
        
        # Should be in forwarding mode
        assert fb._enabled is False
        assert fb._forward_getter is get_logger_func

    def test_replay_and_disable_clears_buffer_even_on_error(self):
        """Verify buffer is cleared even if replay encounters errors"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test message")
        assert len(fb._buffer) == 1
        
        failing_logger = MagicMock()
        failing_logger.info.side_effect = RuntimeError("Logger failed")
        
        # Should not raise
        replay_and_disable(lambda name: failing_logger)
        
        # Buffer should still be cleared (finally block)
        assert len(fb._buffer) == 0

    def test_replay_and_disable_handles_replay_errors(self, capsys):
        """Verify replay errors are caught and don't break startup"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test message")
        
        failing_logger = MagicMock()
        failing_logger.info.side_effect = RuntimeError("Logger failed")
        
        # Should not raise
        replay_and_disable(lambda name: failing_logger)
        
        # Should still disable and set forward getter
        assert fb._enabled is False
        assert fb._forward_getter is not None

    def test_replay_and_disable_handles_stderr_print_errors(self):
        """Verify stderr print errors during replay are swallowed"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test")
        
        failing_logger = MagicMock()
        failing_logger.info.side_effect = Exception("fail")
        
        # Mock stderr to fail as well
        with patch('sys.stderr', MagicMock(write=MagicMock(side_effect=IOError))):
            # Should not raise
            replay_and_disable(lambda name: failing_logger)
        
        # Should still be in forwarding mode
        assert fb._enabled is False

    def test_replay_and_disable_handles_unknown_log_levels(self):
        """Verify replay falls back to info() for unknown log levels"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._buffer.append(("CUSTOM_LEVEL", "custom message", {}, time.time()))
        
        mock_logger = MagicMock()
        # Ensure there's no custom_level method
        if hasattr(mock_logger, "custom_level"):
            delattr(mock_logger, "custom_level")
        
        replay_and_disable(lambda name: mock_logger)
        
        # Should have called info() as fallback
        mock_logger.info.assert_called_once_with("custom message", extra={})

    def test_replay_and_disable_uses_target_logger_name(self):
        """Verify replay_and_disable requests the correct logger"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test")
        
        logger_names = []
        mock_logger = MagicMock()
        
        def get_logger_func(name):
            logger_names.append(name)
            return mock_logger
        
        replay_and_disable(get_logger_func, "custom.startup.logger")
        
        # Should have requested the custom logger name
        assert "custom.startup.logger" in logger_names

    def test_replay_and_disable_enables_forwarding_for_future_logs(self):
        """Verify after replay_and_disable, new logs are forwarded"""
        import src.logging.fallback as fb
        
        # Initial log before replay
        safe_log("INFO", "before replay")
        
        mock_logger = MagicMock()
        replay_and_disable(lambda name: mock_logger, "ai_assistant.startup")
        
        # Clear the mock to check only new calls
        mock_logger.reset_mock()
        
        # New log after replay should be forwarded
        safe_log("INFO", "after replay", {"new": "data"}, "test.logger")
        
        # Should have been forwarded to the real logger
        mock_logger.info.assert_called_once_with("after replay", extra={"new": "data"})

    def test_replay_and_disable_partial_replay_on_error(self):
        """Verify replay continues for remaining messages even if one fails"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "msg1")
        safe_log("WARNING", "msg2")
        safe_log("ERROR", "msg3")
        
        mock_logger = MagicMock()
        # Make the warning call fail
        mock_logger.warning.side_effect = RuntimeError("Warning failed")
        
        # Should not raise
        replay_and_disable(lambda name: mock_logger)
        
        # Should have attempted all calls (info and error should succeed)
        assert mock_logger.info.call_count == 1
        assert mock_logger.warning.call_count == 1
        assert mock_logger.error.call_count == 1


class TestBufferManagement:
    """Test suite for buffer management"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_buffer_respects_maxlen(self):
        """Verify buffer doesn't exceed maxlen of 1000"""
        import src.logging.fallback as fb
        
        # Add more than maxlen messages
        for i in range(1500):
            safe_log("INFO", f"message {i}")
        
        # Should only keep most recent 1000
        assert len(fb._buffer) <= 1000
        
        # Oldest messages should be dropped, most recent should be kept
        last_msg = fb._buffer[-1][1]
        assert "1499" in last_msg

    def test_buffer_maxlen_keeps_most_recent(self):
        """Verify buffer keeps the most recent messages when full"""
        import src.logging.fallback as fb
        
        # Fill buffer beyond capacity
        for i in range(1100):
            safe_log("INFO", f"message {i}")
        
        # First 100 messages should be dropped
        messages = [record[1] for record in fb._buffer]
        
        # Should not contain early messages
        assert "message 0" not in messages
        assert "message 99" not in messages
        
        # Should contain recent messages
        assert "message 1099" in messages

    def test_get_buffer_snapshot_returns_copy(self):
        """Verify get_buffer_snapshot returns a copy of the buffer"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "msg1")
        safe_log("WARNING", "msg2")
        
        snapshot = get_buffer_snapshot()
        
        assert len(snapshot) == 2
        assert snapshot[0][1] == "msg1"
        assert snapshot[1][1] == "msg2"
        
        # Should be a copy, not the original
        assert snapshot is not fb._buffer
        
        # Modifying snapshot shouldn't affect original
        snapshot.clear()
        assert len(fb._buffer) == 2

    def test_get_buffer_snapshot_is_thread_safe(self):
        """Verify get_buffer_snapshot uses lock for thread safety"""
        import src.logging.fallback as fb
        
        # Add some messages
        for i in range(100):
            safe_log("INFO", f"message {i}")
        
        # Get snapshots concurrently
        snapshots = []
        errors = []
        
        def get_snapshot():
            try:
                snapshots.append(get_buffer_snapshot())
            except Exception as e:
                errors.append(e)
        
        threads = [threading.Thread(target=get_snapshot) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        # Should have no errors
        assert len(errors) == 0
        assert len(snapshots) == 20
        
        # All snapshots should have the same length (or similar if racing with other operations)
        for snapshot in snapshots:
            assert len(snapshot) > 0

    def test_buffer_is_deque_with_correct_type(self):
        """Verify buffer contains properly structured records"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test", {"key": "value"}, "logger.name")
        
        record = fb._buffer[0]
        assert isinstance(record, tuple)
        assert len(record) == 4
        
        level, msg, extra, ts = record
        assert isinstance(level, str)
        assert isinstance(msg, str)
        assert isinstance(extra, dict)
        assert isinstance(ts, float)


class TestModuleState:
    """Test suite for module-level state management"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_initial_module_state(self):
        """Verify module starts in correct initial state"""
        import src.logging.fallback as fb
        
        # After setup, should be in initial state
        assert fb._enabled is True
        assert fb._forward_getter is None
        assert isinstance(fb._buffer, deque)
        assert len(fb._buffer) == 0

    def test_module_state_after_replay(self):
        """Verify module state changes correctly after replay"""
        import src.logging.fallback as fb
        
        mock_logger = MagicMock()
        get_logger = lambda name: mock_logger
        
        replay_and_disable(get_logger, "test.logger")
        
        # State should be changed
        assert fb._enabled is False
        assert fb._forward_getter is get_logger
        assert len(fb._buffer) == 0

    def test_concurrent_access_to_module_state(self):
        """Verify module state is thread-safe during concurrent access"""
        import src.logging.fallback as fb
        
        errors = []
        
        def worker():
            try:
                for i in range(50):
                    safe_log("INFO", f"message {i}")
                    snapshot = get_buffer_snapshot()
                    assert isinstance(snapshot, deque)
            except Exception as e:
                errors.append(e)
        
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        assert len(errors) == 0


class TestEdgeCases:
    """Test suite for edge cases and boundary conditions"""

    def setup_method(self):
        """Reset module state before each test"""
        import src.logging.fallback as fb
        fb._buffer.clear()
        fb._enabled = True
        fb._forward_getter = None

    def test_safe_log_with_empty_message(self):
        """Verify safe_log handles empty messages"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "", {}, "logger")
        
        assert len(fb._buffer) == 1
        assert fb._buffer[0][1] == ""

    def test_safe_log_with_special_characters(self):
        """Verify safe_log handles special characters in messages"""
        import src.logging.fallback as fb
        
        special_msg = "Test\n\t\r\0special chars: 🔥 测试"
        safe_log("INFO", special_msg, {}, "logger")
        
        assert len(fb._buffer) == 1
        assert fb._buffer[0][1] == special_msg

    def test_safe_log_with_very_long_message(self):
        """Verify safe_log handles very long messages"""
        import src.logging.fallback as fb
        
        long_msg = "x" * 10000
        safe_log("INFO", long_msg, {}, "logger")
        
        assert len(fb._buffer) == 1
        assert fb._buffer[0][1] == long_msg

    def test_replay_with_empty_buffer(self):
        """Verify replay_and_disable works with empty buffer"""
        import src.logging.fallback as fb
        
        mock_logger = MagicMock()
        
        # Should not raise
        replay_and_disable(lambda name: mock_logger)
        
        # Should still change state
        assert fb._enabled is False
        assert fb._forward_getter is not None
        
        # Logger should not have been called
        assert mock_logger.info.call_count == 0

    def test_multiple_replays(self):
        """Verify multiple calls to replay_and_disable are safe"""
        import src.logging.fallback as fb
        
        safe_log("INFO", "test")
        
        mock_logger1 = MagicMock()
        replay_and_disable(lambda name: mock_logger1)
        
        # Second replay should work even though buffer is empty
        mock_logger2 = MagicMock()
        replay_and_disable(lambda name: mock_logger2)
        
        # Should use the latest forward getter
        assert fb._forward_getter is not None

    def test_safe_log_with_nested_extra_data(self):
        """Verify safe_log handles complex nested extra data"""
        import src.logging.fallback as fb
        
        complex_extra = {
            "nested": {"deep": {"value": 123}},
            "list": [1, 2, 3],
            "mixed": {"nums": [4, 5], "text": "hello"}
        }
        
        safe_log("INFO", "test", complex_extra, "logger")
        
        assert len(fb._buffer) == 1
        assert fb._buffer[0][2] == complex_extra
