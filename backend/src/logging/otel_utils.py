"""
OpenTelemetry utilities for centralized availability checking.

This module provides lazy imports and availability checks for OpenTelemetry packages,
allowing graceful fallback when OTEL is not installed or disabled in configuration.
"""

from typing import Optional, TYPE_CHECKING

# Lazy imports - only load when checking availability
_otel_checked = False
_otel_available = False
_otel_instrumentation_checked = False
_otel_instrumentation_available = False

if TYPE_CHECKING:
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk._logs import LoggerProvider


def is_otel_available() -> bool:
    """
    Check if OpenTelemetry core packages are available.
    
    Uses lazy imports to avoid loading OTEL modules when disabled.
    Checks for:
    - opentelemetry-api
    - opentelemetry-sdk
    - opentelemetry-exporter-otlp (gRPC and HTTP exporters)
    
    Returns:
        bool: True if all required OTEL packages are installed
    """
    global _otel_checked, _otel_available
    
    if _otel_checked:
        return _otel_available
    
    try:
        # Try importing core OTEL components
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        
        # Try importing log components
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
        
        # Try importing OTLP exporters (both gRPC and HTTP)
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter as GRPCSpanExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter as HTTPSpanExporter,
        )
        from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
            OTLPLogExporter as GRPCLogExporter,
        )
        from opentelemetry.exporter.otlp.proto.http._log_exporter import (
            OTLPLogExporter as HTTPLogExporter,
        )
        from opentelemetry.semconv.resource import ResourceAttributes
        
        _otel_available = True
    except ImportError:
        _otel_available = False
    finally:
        _otel_checked = True
    
    return _otel_available


def is_otel_instrumentation_available() -> bool:
    """
    Check if OpenTelemetry instrumentation packages are available.
    
    Uses lazy imports to avoid loading modules when disabled.
    Checks for:
    - opentelemetry-instrumentation-fastapi
    
    Returns:
        bool: True if instrumentation packages are installed
    """
    global _otel_instrumentation_checked, _otel_instrumentation_available
    
    if _otel_instrumentation_checked:
        return _otel_instrumentation_available
    
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        _otel_instrumentation_available = True
    except ImportError:
        _otel_instrumentation_available = False
    finally:
        _otel_instrumentation_checked = True
    
    return _otel_instrumentation_available


def get_installation_instructions() -> str:
    """
    Get installation instructions for OpenTelemetry packages.
    
    Returns:
        str: Installation command for OTEL packages
    """
    return "pip install -e '.[otel]'"
