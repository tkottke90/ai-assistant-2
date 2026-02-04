import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional, Dict
from threading import RLock

from ..config.models.logging import LoggingConfig
from .formatters import JSONFormatter, TextFormatter
from .handlers import OTELManager
from .otel_utils import is_otel_available, get_installation_instructions
from . import fallback

# Define custom HTTP log level
HTTP_LEVEL_NUM = 15
HTTP_LEVEL_NAME = "HTTP"


def add_http_log_level():
    """
    Add custom HTTP log level between DEBUG and INFO

    HTTP = 15 (between DEBUG=10 and INFO=20)
    """
    # Add the level to the logging module
    logging.addLevelName(HTTP_LEVEL_NUM, HTTP_LEVEL_NAME)

    # Add convenience method to Logger class
    def http(self, message, *args, **kwargs):
        """Log at HTTP level (15)"""
        if self.isEnabledFor(HTTP_LEVEL_NUM):
            self._log(HTTP_LEVEL_NUM, message, args, **kwargs)

    # Add the method to Logger class
    logging.Logger.http = http


class LoggerManager:
    """
    Singleton logger manager for the application

    Manages hierarchical loggers with consistent configuration
    """

    _instance: Optional["LoggerManager"] = None
    _lock = RLock()

    def __new__(cls) -> "LoggerManager":
        """Ensure only one instance exists (singleton pattern)"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the logger manager"""
        # Only initialize once
        if hasattr(self, "_initialized"):
            return

        # Register custom HTTP log level
        add_http_log_level()

        self._loggers: Dict[str, logging.Logger] = {}
        self._configured = False
        self._root_logger_name = "ai_assistant"

        self._initialized = True

    def configure(self, configDir: Path, config: LoggingConfig) -> None:
        """
        Configure the logging system

        Args:
            config: LoggingConfig instance
        """
        with self._lock:
            # Get root logger for the application
            root_logger = logging.getLogger(self._root_logger_name)
            
            # Map string level to logging constant
            level_map = {
                "DEBUG": logging.DEBUG,
                "HTTP": HTTP_LEVEL_NUM,
                "INFO": logging.INFO,
                "WARNING": logging.WARNING,
                "ERROR": logging.ERROR,
                "CRITICAL": logging.CRITICAL,
            }
            root_logger.setLevel(level_map.get(config.level, logging.INFO))

            # Remove existing handlers
            root_logger.handlers.clear()

            # Choose formatter
            if config.format == "json":
                formatter = JSONFormatter()
            else:
                formatter = TextFormatter()

            # Add console handler
            if config.enable_console_logging:
                console_handler = logging.StreamHandler()
                console_level = config.console_level or config.level
                console_handler.setLevel(level_map.get(console_level, logging.INFO))
                console_handler.setFormatter(formatter)
                root_logger.addHandler(console_handler)

            # Add file handler with rotation
            if config.enable_file_logging:
                log_path = configDir / config.log_file
                log_path.parent.mkdir(parents=True, exist_ok=True)

                file_handler = RotatingFileHandler(
                    filename=str(log_path),
                    maxBytes=config.max_bytes,
                    backupCount=config.backup_count,
                    encoding="utf-8",
                )
                file_handler.setLevel(level_map.get(config.level, logging.INFO))
                file_handler.setFormatter(formatter)
                root_logger.addHandler(file_handler)

            # Add OpenTelemetry handler
            if config.enable_otel:
                if not is_otel_available():
                    root_logger.warning(
                        "OpenTelemetry requested but packages not installed. "
                        "Install with: %s", get_installation_instructions()
                    )
                else:
                    try:
                        otel_manager = OTELManager.get_instance()
                        otel_handler = otel_manager.configure(config)
                        if otel_handler:
                            root_logger.addHandler(otel_handler)
                            root_logger.info("OTEL handler added successfully")
                    except RuntimeError as e:
                        root_logger.warning("OTEL configuration failed: %s", e)
                    except Exception as e:
                        root_logger.error("Unexpected error configuring OTEL: %s", e, exc_info=True)

            # Configure module-specific levels
            for module_name, level_str in config.module_levels.items():
                module_logger = logging.getLogger(module_name)
                module_logger.setLevel(level_map.get(level_str, logging.INFO))

            # Prevent propagation to root Python logger
            root_logger.propagate = False

            self._configured = True
            root_logger.info("Logging system configured successfully")

            # Replay any buffered startup logs captured by the fallback
            try:
                fallback.replay_and_disable(self.get_logger, target_logger_name="ai_assistant.startup")
            except Exception:
                # Don't allow fallback replay failures to break startup
                root_logger.exception("Failed to replay buffered startup logs from fallback")

    def get_logger(self, name: str) -> logging.Logger:
        """
        Get a logger instance with hierarchical naming

        Args:
            name: Logger name (will be prefixed with 'ai_assistant.')

        Returns:
            Logger instance

        Example:
            >>> logger = manager.get_logger("config.loader")
            >>> # Creates logger named "ai_assistant.config.loader"
        """
        # Ensure name starts with root logger name
        if not name.startswith(f"{self._root_logger_name}."):
            full_name = f"{self._root_logger_name}.{name}"
        else:
            full_name = name

        # Return cached logger if exists
        if full_name in self._loggers:
            return self._loggers[full_name]

        # Create new logger
        logger = logging.getLogger(full_name)
        self._loggers[full_name] = logger

        return logger

    def is_configured(self) -> bool:
        """Check if logging system has been configured"""
        return self._configured
    
    def shutdown(self) -> None:
        """Shutdown logging system and flush buffers."""
        with self._lock:
            # Shutdown OTEL if configured
            try:
                otel_manager = OTELManager.get_instance()
                if otel_manager.is_configured():
                    otel_manager.shutdown()
            except Exception as e:
                logging.error("Error shutting down OTEL: %s", e)
            
            # Shutdown all handlers
            root_logger = logging.getLogger(self._root_logger_name)
            for handler in root_logger.handlers[:]:
                try:
                    handler.close()
                except Exception as e:
                    # Log close errors on the application logger so tests can capture them
                    try:
                        root_logger.error("Error closing handler: %s", e)
                    except Exception:
                        logging.error("Error closing handler: %s", e)
                finally:
                    # Ensure handler is removed even if close() raised
                    try:
                        root_logger.removeHandler(handler)
                    except Exception as e:
                        try:
                            root_logger.error("Error removing handler: %s", e)
                        except Exception:
                            logging.error("Error removing handler: %s", e)


# Global instance
_logger_manager = LoggerManager()


def get_logger(name: str) -> logging.Logger:
    """
    Convenience function to get a logger

    Args:
        name: Logger name (will be prefixed with 'ai_assistant.')

    Returns:
        Logger instance

    Example:
        >>> from src.logging import get_logger
        >>> logger = get_logger("config.loader")
    """
    return _logger_manager.get_logger(name)

