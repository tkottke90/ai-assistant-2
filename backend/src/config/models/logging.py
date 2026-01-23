from typing import Optional, Literal, Dict
from pydantic import Field, field_validator, model_validator
from .base import BaseConfig
from typing import ClassVar
from enum import Enum


class OTELProtocol(str, Enum):
    """OTLP protocol types."""
    GRPC = "grpc"
    HTTP = "http"


class LoggingConfig(BaseConfig):
    requires_restart: ClassVar[bool] = True  # Logging changes need restart

    # Basic settings
    level: Literal["DEBUG", "HTTP", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Global logging level"
    )

    # Output format
    format: Literal["json", "text"] = Field(
        default="json",
        description="Log output format (json for JSON Lines, text for human-readable)",
    )

    # File logging
    enable_file_logging: bool = Field(
        default=True, description="Enable logging to file"
    )

    log_file: str = Field(
        default="~/.config/ai-assistant/logs/app.log",
        description="Path to log file (supports ~ expansion)",
    )

    # Rotation settings
    max_bytes: int = Field(
        default=10_485_760,  # 10 MB
        ge=1_048_576,  # Min 1 MB
        description="Maximum log file size in bytes before rotation",
    )

    backup_count: int = Field(
        default=5, ge=0, description="Number of backup log files to keep"
    )

    # Console logging
    enable_console_logging: bool = Field(
        default=True, description="Enable logging to console/stdout"
    )

    console_level: Optional[
        Literal["DEBUG", "HTTP", "INFO", "WARNING", "ERROR", "CRITICAL"]
    ] = Field(
        default=None,
        description="Console logging level (defaults to global level if not set)",
    )

    # OpenTelemetry Configuration
    enable_otel: bool = Field(
        default=False, description="Enable OpenTelemetry export"
    )

    otel_endpoint: Optional[str] = Field(
        default=None,
        description="OTLP endpoint URL (e.g., http://alloy:4317 for gRPC, http://alloy:4318 for HTTP)",
    )

    otel_protocol: OTELProtocol = Field(
        default=OTELProtocol.GRPC,
        description="OTLP protocol: grpc or http",
    )

    otel_service_name: str = Field(
        default="ai-assistant", description="Service name for OTEL identification"
    )

    otel_service_version: Optional[str] = Field(
        default=None,
        description="Service version (e.g., 1.0.0)",
    )

    otel_service_namespace: Optional[str] = Field(
        default=None,
        description="Service namespace (e.g., production, staging)",
    )

    otel_deployment_environment: str = Field(
        default="development",
        description="Deployment environment (development, staging, production)",
    )

    otel_insecure: bool = Field(
        default=True,
        description="Use insecure connection (disable TLS)",
    )

    otel_headers: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional headers for OTLP endpoint (e.g., authentication)",
    )

    # OTEL export configuration
    otel_export_logs: bool = Field(
        default=True,
        description="Export logs to OTLP endpoint",
    )

    otel_export_traces: bool = Field(
        default=True,
        description="Export traces to OTLP endpoint",
    )

    otel_export_metrics: bool = Field(
        default=False,
        description="Export metrics to OTLP endpoint (future use)",
    )

    # OTEL performance tuning
    otel_batch_size: int = Field(
        default=512,
        description="Maximum batch size for OTEL exports",
        ge=1,
        le=2048,
    )

    otel_schedule_delay_ms: int = Field(
        default=5000,
        description="Delay between batch exports in milliseconds",
        ge=100,
        le=30000,
    )

    otel_export_timeout_ms: int = Field(
        default=30000,
        description="Export timeout in milliseconds",
        ge=1000,
        le=60000,
    )

    otel_max_queue_size: int = Field(
        default=2048,
        description="Maximum queue size for pending exports",
        ge=512,
        le=8192,
    )

    # OTEL resource attributes (custom metadata)
    otel_resource_attributes: Dict[str, str] = Field(
        default_factory=dict,
        description="Custom resource attributes (key-value pairs)",
    )

    # Module-specific levels
    module_levels: dict[str, str] = Field(
        default_factory=dict,
        description="Per-module log levels (e.g., {'ai_assistant.llm': 'DEBUG'})",
    )

    # HTTP Middleware settings
    enable_http_logging: bool = Field(
        default=True, description="Enable HTTP request/response logging middleware"
    )

    log_request_body: bool = Field(
        default=False,
        description="Log HTTP request bodies (WARNING: may log sensitive data)",
    )

    log_response_body: bool = Field(
        default=False,
        description="Log HTTP response bodies (WARNING: performance impact)",
    )

    exclude_paths: list[str] = Field(
        default_factory=lambda: ["/health"],
        description="Paths to exclude from HTTP logging",
    )

    @field_validator("log_file")
    @classmethod
    def expand_log_file_path(cls, v: str) -> str:
        """Expand ~ in log file path"""
        from pathlib import Path

        return str(Path(v).expanduser())

    @field_validator("otel_endpoint")
    @classmethod
    def validate_otel_endpoint(cls, v: Optional[str], info) -> Optional[str]:
        """Validate OTEL endpoint is provided when OTEL is enabled."""
        if info.data.get("enable_otel") and not v:
            raise ValueError("otel_endpoint is required when enable_otel is True")
        return v

    @field_validator("otel_headers")
    @classmethod
    def validate_otel_headers(cls, v: Dict[str, str]) -> Dict[str, str]:
        """Validate OTEL headers are strings."""
        if not all(isinstance(k, str) and isinstance(val, str) for k, val in v.items()):
            raise ValueError("All otel_headers keys and values must be strings")
        return v

    @model_validator(mode="after")
    def validate_otel_export_options(self) -> "LoggingConfig":
        """Validate at least one OTEL export option is enabled."""
        if self.enable_otel:
            if not any([self.otel_export_logs, self.otel_export_traces, self.otel_export_metrics]):
                raise ValueError(
                    "At least one OTEL export option must be enabled "
                    "(otel_export_logs, otel_export_traces, or otel_export_metrics)"
                )
        return self

