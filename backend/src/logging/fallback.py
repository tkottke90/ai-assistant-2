import sys
import time
import threading
from collections import deque
from typing import Any, Callable, Deque, Dict, Tuple, Optional

# A lightweight fallback logger used during application startup before the
# full LoggerManager is configured. It prints to stderr immediately and
# buffers records for replay once the real logging system is ready.

Record = Tuple[str, str, Dict[str, Any], float]  # (level_name, msg, extra, ts)

_lock = threading.RLock()
_buffer: Deque[Record] = deque(maxlen=1000)
_forward_getter: Optional[Callable[[str], Any]] = None
_enabled = True


def _now_iso(ts: Optional[float] = None) -> str:
    if ts is None:
        ts = time.time()
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts))


def _print_stderr(level: str, logger_name: str, msg: str, ts: float) -> None:
    line = f"[{_now_iso(ts)}] [{level}] [{logger_name}] {msg}"
    print(line, file=sys.stderr)


def safe_log(level: str, msg: str, extra: Optional[Dict[str, Any]] = None, logger_name: str = "ai_assistant.startup") -> None:
    """Thread-safe fallback logging used before LoggerManager is configured.

    - Prints immediately to stderr for developer visibility.
    - Buffers the record for replay when the real logger is configured.
    - If forwarding has been enabled, will try to forward to the real logger.
    """
    global _buffer, _forward_getter, _enabled
    extra = extra or {}
    ts = time.time()
    with _lock:
        # immediate visibility
        try:
            _print_stderr(level, logger_name, msg, ts)
        except Exception:
            pass

        # buffer the record for later replay
        try:
            _buffer.append((level, msg, extra, ts))
        except Exception:
            # never fail startup because of logging
            pass

        # if forwarding is enabled (post-config), try to forward
        if not _enabled and _forward_getter is not None:
            try:
                real_logger = _forward_getter(logger_name)
                getattr(real_logger, level.lower(), real_logger.info)(msg, extra=extra)
            except Exception:
                # never raise from fallback
                pass


def safe_info(msg: str, extra: Optional[Dict[str, Any]] = None, logger_name: str = "ai_assistant.startup") -> None:
    safe_log("INFO", msg, extra, logger_name)


def safe_warning(msg: str, extra: Optional[Dict[str, Any]] = None, logger_name: str = "ai_assistant.startup") -> None:
    safe_log("WARNING", msg, extra, logger_name)


def safe_error(msg: str, extra: Optional[Dict[str, Any]] = None, logger_name: str = "ai_assistant.startup") -> None:
    safe_log("ERROR", msg, extra, logger_name)


def replay_and_disable(get_logger_callable: Callable[[str], Any], target_logger_name: str = "ai_assistant.startup") -> None:
    """Replay buffered records into the real logger and switch to forwarding.

    After replay the fallback will forward future messages to the configured
    logging system instead of only printing to stderr.
    """
    global _buffer, _forward_getter, _enabled
    with _lock:
        # Replay buffered records
        try:
            for level, msg, extra, ts in list(_buffer):
                try:
                    real_logger = get_logger_callable(target_logger_name)
                    getattr(real_logger, level.lower(), real_logger.info)(msg, extra=extra)
                except Exception:
                    # swallow errors — don't break startup
                    try:
                        print(f"[fallback replay error] {level} {msg}", file=sys.stderr)
                    except Exception:
                        pass
            _buffer.clear()
        finally:
            # disable buffering and enable forwarding
            _enabled = False
            _forward_getter = get_logger_callable


def get_buffer_snapshot() -> Deque[Record]:
    with _lock:
        return deque(_buffer)
