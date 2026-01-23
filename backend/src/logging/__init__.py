from .manager import LoggerManager, get_logger
from .otel_utils import is_otel_available, is_otel_instrumentation_available
from . import fallback

__all__ = [
    "LoggerManager",
    "get_logger",
    "fallback",
    "is_otel_available",
    "is_otel_instrumentation_available",
]

