"""Custom logging handlers including OpenTelemetry support."""

import logging
import traceback
from typing import Optional, TYPE_CHECKING
from threading import RLock

from .otel_utils import is_otel_available, get_installation_instructions

if TYPE_CHECKING:
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk._logs import LoggerProvider
    from src.config.models.logging import LoggingConfig


class OTELManager:
    """
    Manages OpenTelemetry configuration and lifecycle.
    
    Singleton pattern ensures single OTEL provider instance across application.
    Thread-safe initialization and shutdown.
    """
    
    _instance: Optional['OTELManager'] = None
    _lock: RLock = RLock()
    _tracer_provider: Optional['TracerProvider'] = None
    _logger_provider: Optional['LoggerProvider'] = None
    _configured: bool = False
    
    def __init__(self):
        """Initialize OTEL manager (use get_instance() instead)."""
        pass
    
    @classmethod
    def get_instance(cls) -> 'OTELManager':
        """
        Get singleton instance of OTELManager.
        
        Returns:
            OTELManager singleton instance
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def configure(self, config: 'LoggingConfig') -> Optional[logging.Handler]:
        """
        Configure OpenTelemetry exporters based on configuration.
        
        Args:
            config: LoggingConfig with OTEL settings
            
        Returns:
            LoggingHandler instance if OTEL logs enabled, None otherwise
            
        Raises:
            ValueError: If configuration is invalid
            RuntimeError: If OTEL packages not installed or already configured
        """
        with self._lock:
            if self._configured:
                raise RuntimeError("OTELManager already configured. Call shutdown() first.")
            
            if not config.enable_otel:
                return None
            
            if not is_otel_available():
                raise RuntimeError(
                    f"OpenTelemetry packages not installed. "
                    f"Install with: {get_installation_instructions()}"
                )
            
            # Import here after availability check (lazy import)
            from opentelemetry import trace
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter as GRPCSpanExporter,
            )
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter as HTTPSpanExporter,
            )
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.semconv.resource import ResourceAttributes
            from opentelemetry._logs import set_logger_provider
            from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
            from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
            from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
                OTLPLogExporter as GRPCLogExporter,
            )
            from opentelemetry.exporter.otlp.proto.http._log_exporter import (
                OTLPLogExporter as HTTPLogExporter,
            )
            
            try:
                # Build resource with service metadata
                resource_attrs = {
                    ResourceAttributes.SERVICE_NAME: config.otel_service_name,
                    ResourceAttributes.SERVICE_VERSION: config.otel_service_version or "unknown",
                    ResourceAttributes.DEPLOYMENT_ENVIRONMENT: config.otel_deployment_environment,
                }
                
                # Add optional namespace
                if config.otel_service_namespace:
                    resource_attrs[ResourceAttributes.SERVICE_NAMESPACE] = config.otel_service_namespace
                
                # Add custom resource attributes
                resource_attrs.update(config.otel_resource_attributes)
                
                resource = Resource.create(resource_attrs)
                
                # Configure traces if enabled
                if config.otel_export_traces:
                    self._configure_traces(config, resource)
                
                # Configure logs if enabled
                log_handler = None
                if config.otel_export_logs:
                    log_handler = self._configure_logs(config, resource)
                
                self._configured = True
                return log_handler
                
            except Exception as e:
                # Log error and re-raise
                logging.error(
                    "Failed to configure OpenTelemetry: %s\n%s",
                    str(e),
                    traceback.format_exc()
                )
                raise
    
    def _configure_traces(self, config: 'LoggingConfig', resource) -> None:
        """
        Configure trace export to OTLP endpoint.
        
        Args:
            config: Logging configuration
            resource: OTEL resource with service metadata
        """
        # Import here (lazy)
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter as GRPCSpanExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter as HTTPSpanExporter,
        )
        from src.config.models.logging import OTELProtocol
        
        logging.info(
            "Configuring OTEL traces: endpoint=%s protocol=%s service=%s",
            config.otel_endpoint,
            config.otel_protocol,
            config.otel_service_name,
        )
        
        # Create appropriate exporter based on protocol
        if config.otel_protocol == OTELProtocol.GRPC:
            span_exporter = GRPCSpanExporter(
                endpoint=config.otel_endpoint,
                insecure=config.otel_insecure,
                headers=tuple(config.otel_headers.items()) if config.otel_headers else None,
                timeout=config.otel_export_timeout_ms // 1000,
            )
        else:  # HTTP
            # HTTP exporter expects full endpoint path
            endpoint = config.otel_endpoint
            if not endpoint.endswith('/v1/traces'):
                endpoint = f"{endpoint.rstrip('/')}/v1/traces"
            
            span_exporter = HTTPSpanExporter(
                endpoint=endpoint,
                headers=config.otel_headers,
                timeout=config.otel_export_timeout_ms // 1000,
            )
        
        # Create tracer provider with resource
        self._tracer_provider = TracerProvider(resource=resource)
        
        # Add batch span processor with tuning parameters
        self._tracer_provider.add_span_processor(
            BatchSpanProcessor(
                span_exporter,
                max_export_batch_size=config.otel_batch_size,
                schedule_delay_millis=config.otel_schedule_delay_ms,
                export_timeout_millis=config.otel_export_timeout_ms,
                max_queue_size=config.otel_max_queue_size,
            )
        )
        
        # Set as global tracer provider
        trace.set_tracer_provider(self._tracer_provider)
        
        logging.info("OTEL trace export configured successfully")
    
    def _configure_logs(self, config: 'LoggingConfig', resource) -> logging.Handler:
        """
        Configure log export to OTLP endpoint.
        
        Args:
            config: Logging configuration
            resource: OTEL resource with service metadata
            
        Returns:
            LoggingHandler that bridges Python logging to OTEL
        """
        # Import here (lazy)
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
        from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
            OTLPLogExporter as GRPCLogExporter,
        )
        from opentelemetry.exporter.otlp.proto.http._log_exporter import (
            OTLPLogExporter as HTTPLogExporter,
        )
        from src.config.models.logging import OTELProtocol
        
        logging.info(
            "Configuring OTEL logs: endpoint=%s protocol=%s service=%s",
            config.otel_endpoint,
            config.otel_protocol,
            config.otel_service_name,
        )
        
        # Create appropriate exporter based on protocol
        if config.otel_protocol == OTELProtocol.GRPC:
            log_exporter = GRPCLogExporter(
                endpoint=config.otel_endpoint,
                insecure=config.otel_insecure,
                headers=tuple(config.otel_headers.items()) if config.otel_headers else None,
                timeout=config.otel_export_timeout_ms // 1000,
            )
        else:  # HTTP
            # HTTP exporter expects full endpoint path
            endpoint = config.otel_endpoint
            if not endpoint.endswith('/v1/logs'):
                endpoint = f"{endpoint.rstrip('/')}/v1/logs"
            
            log_exporter = HTTPLogExporter(
                endpoint=endpoint,
                headers=config.otel_headers,
                timeout=config.otel_export_timeout_ms // 1000,
            )
        
        # Create logger provider with resource
        self._logger_provider = LoggerProvider(resource=resource)
        
        # Add batch log record processor with tuning parameters
        self._logger_provider.add_log_record_processor(
            BatchLogRecordProcessor(
                log_exporter,
                max_export_batch_size=config.otel_batch_size,
                schedule_delay_millis=config.otel_schedule_delay_ms,
                export_timeout_millis=config.otel_export_timeout_ms,
                max_queue_size=config.otel_max_queue_size,
            )
        )
        
        # Set as global logger provider
        set_logger_provider(self._logger_provider)
        
        # Create handler that bridges Python logging to OTEL
        # Level is NOTSET so it respects logger levels
        handler = LoggingHandler(
            level=logging.NOTSET,
            logger_provider=self._logger_provider,
        )
        
        logging.info("OTEL log export configured successfully")
        return handler
    
    def get_tracer(self, name: str):
        """
        Get a tracer for manual instrumentation.
        
        Args:
            name: Tracer name (typically module name)
            
        Returns:
            Tracer instance if traces configured, None otherwise
        """
        if self._tracer_provider:
            return self._tracer_provider.get_tracer(name)
        return None
    
    def is_configured(self) -> bool:
        """Check if OTEL is configured."""
        return self._configured
    
    def shutdown(self, timeout_seconds: int = 30) -> None:
        """
        Gracefully shutdown OTEL providers, flushing pending telemetry.
        
        Args:
            timeout_seconds: Maximum time to wait for flush
        """
        with self._lock:
            if not self._configured:
                return
            
            if self._tracer_provider:
                logging.info("Shutting down OTEL tracer provider")
                try:
                    self._tracer_provider.shutdown()
                except Exception as e:
                    logging.error("Error shutting down tracer provider: %s", e)
            
            if self._logger_provider:
                logging.info("Shutting down OTEL logger provider")
                try:
                    self._logger_provider.shutdown()
                except Exception as e:
                    logging.error("Error shutting down logger provider: %s", e)
            
            self._tracer_provider = None
            self._logger_provider = None
            self._configured = False
            
            logging.info("OTEL shutdown complete")

