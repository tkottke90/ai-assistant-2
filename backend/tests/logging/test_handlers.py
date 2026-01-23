"""Unit tests for logging handlers including OTELManager."""

import pytest
import logging
import threading
from unittest.mock import MagicMock, Mock, patch
from typing import Optional

from src.logging.handlers import OTELManager
from src.logging.otel_utils import is_otel_available
from src.config.models.logging import LoggingConfig, OTELProtocol


class TestOTELManager:
    """Test suite for OTELManager"""

    def setup_method(self):
        """Reset OTELManager singleton before each test"""
        # Clear singleton instance
        OTELManager._instance = None
        OTELManager._configured = False
        OTELManager._tracer_provider = None
        OTELManager._logger_provider = None

    def teardown_method(self):
        """Clean up after each test"""
        # Reset singleton state
        if OTELManager._instance is not None:
            try:
                if OTELManager._instance._configured:
                    OTELManager._instance.shutdown()
            except Exception:
                pass
        OTELManager._instance = None
        OTELManager._configured = False
        OTELManager._tracer_provider = None
        OTELManager._logger_provider = None

    # HIGH PRIORITY - Singleton and Basic Tests

    def test_get_instance_returns_singleton(self):
        """Multiple calls should return same instance"""
        instance1 = OTELManager.get_instance()
        instance2 = OTELManager.get_instance()

        assert instance1 is instance2

    def test_get_instance_thread_safe(self):
        """Singleton creation should be thread-safe"""
        instances = []

        def create_instance():
            instances.append(OTELManager.get_instance())

        threads = [threading.Thread(target=create_instance) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # All instances should be same object
        assert all(inst is instances[0] for inst in instances)

    def test_is_configured_false_by_default(self):
        """Should return False before configuration"""
        manager = OTELManager.get_instance()
        assert not manager.is_configured()

    # HIGH PRIORITY - Configuration Tests

    def test_configure_with_otel_disabled_returns_none(self):
        """Configure should return None when OTEL disabled"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(enable_otel=False)

        result = manager.configure(config)

        assert result is None
        assert not manager.is_configured()

    def test_configure_raises_when_otel_unavailable(self, monkeypatch):
        """Should raise RuntimeError when OTEL packages not installed"""
        monkeypatch.setattr("src.logging.handlers.is_otel_available", lambda: False)

        manager = OTELManager.get_instance()
        config = LoggingConfig(enable_otel=True, otel_endpoint="http://localhost:4317")

        with pytest.raises(RuntimeError, match="OpenTelemetry packages not installed"):
            manager.configure(config)

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_raises_when_already_configured(self):
        """Should raise RuntimeError when configure called twice"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=False
        )

        manager.configure(config)

        with pytest.raises(RuntimeError, match="already configured"):
            manager.configure(config)

        # Cleanup
        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_creates_resource_with_metadata(self):
        """Should create OTEL resource with service metadata"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_service_name="test-service",
            otel_service_version="1.0.0",
            otel_service_namespace="testing",
            otel_deployment_environment="dev",
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.sdk.resources.Resource') as mock_resource_class:
            mock_resource = MagicMock()
            mock_resource_class.create.return_value = mock_resource

            manager.configure(config)

            # Verify resource created with correct attributes
            assert mock_resource_class.create.called
            attrs = mock_resource_class.create.call_args[0][0]
            assert 'service.name' in attrs
            assert attrs['service.name'] == 'test-service'
            assert attrs.get('service.version') == '1.0.0'

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_includes_custom_resource_attributes(self):
        """Should merge custom resource attributes into resource"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_resource_attributes={"region": "us-east-1", "cluster": "prod"},
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.sdk.resources.Resource') as mock_resource_class:
            mock_resource = MagicMock()
            mock_resource_class.create.return_value = mock_resource

            manager.configure(config)

            attrs = mock_resource_class.create.call_args[0][0]
            assert attrs['region'] == 'us-east-1'
            assert attrs['cluster'] == 'prod'

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_logs_error_and_re_raises(self, caplog):
        """Should log error with traceback and re-raise exception"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.sdk.resources.Resource.create', side_effect=ValueError("Mock error")):
            with pytest.raises(ValueError, match="Mock error"):
                manager.configure(config)

            # Should log error with traceback
            assert "Failed to configure OpenTelemetry" in caplog.text

    # HIGH PRIORITY - Trace Configuration Tests

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_traces_uses_grpc_exporter(self):
        """Should use gRPC span exporter when protocol is GRPC"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_protocol=OTELProtocol.GRPC,
            otel_export_traces=True,
            otel_export_logs=False
        )

        with patch('opentelemetry.exporter.otlp.proto.grpc.trace_exporter.OTLPSpanExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            assert mock_exporter.called
            call_kwargs = mock_exporter.call_args[1]
            assert call_kwargs['endpoint'] == 'http://localhost:4317'
            assert call_kwargs['insecure'] is True

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_traces_uses_http_exporter_with_path(self):
        """Should use HTTP span exporter with /v1/traces path appended"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4318",
            otel_protocol=OTELProtocol.HTTP,
            otel_export_traces=True,
            otel_export_logs=False
        )

        with patch('opentelemetry.exporter.otlp.proto.http.trace_exporter.OTLPSpanExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            assert mock_exporter.called
            call_kwargs = mock_exporter.call_args[1]
            # Should append /v1/traces to endpoint
            assert call_kwargs['endpoint'] == 'http://localhost:4318/v1/traces'

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_traces_http_exporter_preserves_existing_path(self):
        """Should not double-append /v1/traces if already present"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4318/v1/traces",
            otel_protocol=OTELProtocol.HTTP,
            otel_export_traces=True,
            otel_export_logs=False
        )

        with patch('opentelemetry.exporter.otlp.proto.http.trace_exporter.OTLPSpanExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            call_kwargs = mock_exporter.call_args[1]
            # Should not double-append
            assert call_kwargs['endpoint'] == 'http://localhost:4318/v1/traces'
            assert call_kwargs['endpoint'].count('/v1/traces') == 1

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_traces_sets_batch_processor_parameters(self):
        """Should configure BatchSpanProcessor with tuning parameters"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=True,
            otel_export_logs=False,
            otel_batch_size=512,
            otel_schedule_delay_ms=5000,
            otel_export_timeout_ms=30000,
            otel_max_queue_size=2048
        )

        with patch('opentelemetry.sdk.trace.export.BatchSpanProcessor') as mock_processor:
            mock_processor.return_value = MagicMock()
            manager.configure(config)

            assert mock_processor.called
            call_kwargs = mock_processor.call_args[1]
            assert call_kwargs['max_export_batch_size'] == 512
            assert call_kwargs['schedule_delay_millis'] == 5000
            assert call_kwargs['export_timeout_millis'] == 30000
            assert call_kwargs['max_queue_size'] == 2048

        manager.shutdown()

    # HIGH PRIORITY - Log Configuration Tests

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_logs_uses_grpc_exporter(self):
        """Should use gRPC log exporter and return LoggingHandler"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_protocol=OTELProtocol.GRPC,
            otel_export_traces=False,
            otel_export_logs=True
        )

        handler = manager.configure(config)

        assert handler is not None
        assert isinstance(handler, logging.Handler)

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_logs_uses_http_exporter_with_path(self):
        """Should use HTTP log exporter with /v1/logs path appended"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4318",
            otel_protocol=OTELProtocol.HTTP,
            otel_export_traces=False,
            otel_export_logs=True
        )

        with patch('opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            assert mock_exporter.called
            call_kwargs = mock_exporter.call_args[1]
            # Should append /v1/logs to endpoint
            assert call_kwargs['endpoint'] == 'http://localhost:4318/v1/logs'

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_logs_http_exporter_preserves_existing_path(self):
        """Should not double-append /v1/logs if already present"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4318/v1/logs",
            otel_protocol=OTELProtocol.HTTP,
            otel_export_traces=False,
            otel_export_logs=True
        )

        with patch('opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            call_kwargs = mock_exporter.call_args[1]
            # Should not double-append
            assert call_kwargs['endpoint'] == 'http://localhost:4318/v1/logs'
            assert call_kwargs['endpoint'].count('/v1/logs') == 1

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_logs_sets_batch_processor_parameters(self):
        """Should configure BatchLogRecordProcessor with tuning parameters"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=False,
            otel_export_logs=True,
            otel_batch_size=1024,
            otel_max_queue_size=2048,
            otel_export_timeout_ms=30000
        )

        with patch('opentelemetry.sdk._logs.export.BatchLogRecordProcessor') as mock_processor:
            mock_processor.return_value = MagicMock()
            manager.configure(config)

            assert mock_processor.called
            call_kwargs = mock_processor.call_args[1]
            assert call_kwargs['max_export_batch_size'] == 1024
            assert call_kwargs['max_queue_size'] == 2048
            assert call_kwargs['export_timeout_millis'] == 30000

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_both_traces_and_logs(self):
        """Should configure both traces and logs when both enabled"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=True,
            otel_export_logs=True
        )

        handler = manager.configure(config)

        # Should return handler for logs
        assert handler is not None
        assert isinstance(handler, logging.Handler)

        # Should have both providers configured
        assert manager._tracer_provider is not None
        assert manager._logger_provider is not None

        manager.shutdown()

    # HIGH PRIORITY - Shutdown Tests

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_shutdown_closes_providers_and_resets_state(self):
        """Should shutdown providers and reset configured flag"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=True
        )

        manager.configure(config)
        assert manager.is_configured()

        manager.shutdown()

        assert not manager.is_configured()
        assert manager._tracer_provider is None
        assert manager._logger_provider is None

    def test_shutdown_is_noop_when_not_configured(self):
        """Shutdown should be safe to call when not configured"""
        manager = OTELManager.get_instance()
        manager.shutdown()  # Should not raise

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_shutdown_is_idempotent(self):
        """Shutdown can be called multiple times safely"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=False
        )

        manager.configure(config)

        # Call shutdown multiple times
        manager.shutdown()
        manager.shutdown()
        manager.shutdown()

        assert not manager.is_configured()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_shutdown_continues_if_tracer_shutdown_fails(self, caplog):
        """Should log error but continue if tracer shutdown fails"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=True,
            otel_export_logs=False
        )

        manager.configure(config)
        # Mock tracer provider shutdown to fail
        manager._tracer_provider.shutdown = Mock(side_effect=RuntimeError("Shutdown error"))

        with caplog.at_level(logging.ERROR):
            manager.shutdown()  # Should not raise

        assert "Error shutting down tracer provider" in caplog.text
        assert not manager.is_configured()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_shutdown_continues_if_logger_shutdown_fails(self, caplog):
        """Should log error but continue if logger shutdown fails"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=False,
            otel_export_logs=True
        )

        manager.configure(config)
        # Mock logger provider shutdown to fail
        manager._logger_provider.shutdown = Mock(side_effect=RuntimeError("Shutdown error"))

        with caplog.at_level(logging.ERROR):
            manager.shutdown()  # Should not raise

        assert "Error shutting down logger provider" in caplog.text
        assert not manager.is_configured()

    # MEDIUM PRIORITY - get_tracer Tests

    def test_get_tracer_returns_none_when_not_configured(self):
        """Should return None when tracer provider not set"""
        manager = OTELManager.get_instance()
        tracer = manager.get_tracer("test")

        assert tracer is None

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_get_tracer_returns_tracer_when_configured(self):
        """Should return tracer from provider when configured"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_traces=True,
            otel_export_logs=False
        )

        manager.configure(config)
        tracer = manager.get_tracer("test.module")

        assert tracer is not None
        # Verify it's the OTEL tracer type
        from opentelemetry.trace import Tracer
        assert isinstance(tracer, Tracer)

        manager.shutdown()

    # MEDIUM PRIORITY - Configuration Edge Cases

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_with_optional_service_namespace(self):
        """Should handle optional service namespace correctly"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_service_namespace="production",
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.sdk.resources.Resource') as mock_resource_class:
            mock_resource = MagicMock()
            mock_resource_class.create.return_value = mock_resource

            manager.configure(config)

            attrs = mock_resource_class.create.call_args[0][0]
            assert 'service.namespace' in attrs
            assert attrs['service.namespace'] == 'production'

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_without_optional_service_namespace(self):
        """Should not include service namespace when not provided"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_service_namespace=None,
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.sdk.resources.Resource') as mock_resource_class:
            mock_resource = MagicMock()
            mock_resource_class.create.return_value = mock_resource

            manager.configure(config)

            attrs = mock_resource_class.create.call_args[0][0]
            # Should not have service.namespace key when None
            assert 'service.namespace' not in attrs

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_with_custom_headers(self):
        """Should pass custom headers to exporters"""
        manager = OTELManager.get_instance()
        custom_headers = {"Authorization": "Bearer token123", "X-Custom": "value"}
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_protocol=OTELProtocol.GRPC,
            otel_headers=custom_headers,
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.exporter.otlp.proto.grpc._log_exporter.OTLPLogExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            call_kwargs = mock_exporter.call_args[1]
            # gRPC expects tuple of tuples for headers
            assert call_kwargs['headers'] == tuple(custom_headers.items())

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_with_empty_headers(self):
        """Should handle empty headers correctly"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_protocol=OTELProtocol.GRPC,
            otel_headers={},
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.exporter.otlp.proto.grpc._log_exporter.OTLPLogExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            call_kwargs = mock_exporter.call_args[1]
            assert call_kwargs['headers'] is None

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_converts_timeout_to_seconds(self):
        """Should convert timeout from milliseconds to seconds"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_timeout_ms=45000,  # 45 seconds in ms
            otel_export_logs=True,
            otel_export_traces=False
        )

        with patch('opentelemetry.exporter.otlp.proto.grpc._log_exporter.OTLPLogExporter') as mock_exporter:
            mock_exporter.return_value = MagicMock()
            manager.configure(config)

            call_kwargs = mock_exporter.call_args[1]
            # Should convert ms to seconds
            assert call_kwargs['timeout'] == 45

        manager.shutdown()

    # MEDIUM PRIORITY - Thread Safety

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_configure_thread_safe_with_lock(self):
        """Configure should use lock to prevent concurrent configuration"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=False
        )

        # First configuration should succeed
        manager.configure(config)

        # Second concurrent attempt should raise RuntimeError
        with pytest.raises(RuntimeError, match="already configured"):
            manager.configure(config)

        manager.shutdown()

    @pytest.mark.skipif(not is_otel_available(), reason="OTEL not installed")
    def test_shutdown_thread_safe_with_lock(self):
        """Shutdown should use lock for thread safety"""
        manager = OTELManager.get_instance()
        config = LoggingConfig(
            enable_otel=True,
            otel_endpoint="http://localhost:4317",
            otel_export_logs=True,
            otel_export_traces=False
        )

        manager.configure(config)

        # Multiple threads shutting down should be safe
        def shutdown_task():
            try:
                manager.shutdown()
            except Exception:
                pass

        threads = [threading.Thread(target=shutdown_task) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Should end up not configured
        assert not manager.is_configured()
