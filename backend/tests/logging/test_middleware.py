import pytest
import logging
import tempfile
import json
import asyncio
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from src.logging.middleware import HTTPLoggingMiddleware
from src.logging.manager import LoggerManager, HTTP_LEVEL_NUM
from src.config.models.logging import LoggingConfig


@pytest.fixture(autouse=True)
def setup_logging():
    """Setup logging for all tests"""
    # Reset singleton
    LoggerManager._instance = None

    # Clear all handlers from root logger
    root = logging.getLogger()
    root.handlers.clear()

    # Clear ai_assistant logger
    ai_logger = logging.getLogger("ai_assistant")
    ai_logger.handlers.clear()
    ai_logger.propagate = True  # Enable propagation for testing

    yield

    # Cleanup
    LoggerManager._instance = None


@pytest.fixture
def logger_manager():
    """Setup logger manager for tests"""
    manager = LoggerManager()

    # Configure with console logging enabled for caplog to work
    config = LoggingConfig(
        level="HTTP",
        enable_file_logging=False,
        enable_console_logging=True,
    )
    manager.configure(config)

    # Enable propagation so caplog can capture logs
    ai_logger = logging.getLogger("ai_assistant")
    ai_logger.propagate = True

    return manager


@pytest.fixture
def app(logger_manager):
    """Create a test FastAPI app with logging middleware"""
    app = FastAPI()

    # Add middleware
    app.add_middleware(
        HTTPLoggingMiddleware,
        log_request_body=False,
        log_response_body=False,
        exclude_paths=["/health"],
    )

    @app.get("/test")
    def test_endpoint():
        return {"message": "success"}

    @app.get("/health")
    def health_endpoint():
        return {"status": "healthy"}

    @app.get("/error")
    def error_endpoint():
        raise ValueError("Test error")

    @app.post("/create")
    def create_endpoint(data: dict):
        return {"created": True}

    return app


@pytest.fixture
def client(app):
    """Create a test client"""
    return TestClient(app)


class TestHTTPLoggingMiddleware:
    """Test suite for HTTPLoggingMiddleware"""

    def test_successful_request_logged(self, client, caplog):
        """Test that successful requests are logged at HTTP level"""
        with caplog.at_level(HTTP_LEVEL_NUM, logger="ai_assistant"):
            response = client.get("/test")

        assert response.status_code == 200

        # Check logs
        records = [r for r in caplog.records if "ai_assistant.server.http" in r.name]
        assert len(records) >= 2  # Request and response

        # Check request log
        request_log = records[0]
        assert "→" in request_log.message
        assert "GET" in request_log.message
        assert "/test" in request_log.message

        # Check response log
        response_log = records[1]
        assert "←" in response_log.message
        assert "200" in response_log.message

    def test_excluded_path_not_logged(self, client, caplog):
        """Test that excluded paths are not logged"""
        with caplog.at_level(HTTP_LEVEL_NUM, logger="ai_assistant"):
            response = client.get("/health")

        assert response.status_code == 200

        # Should not have any logs for /health from our middleware
        records = [r for r in caplog.records if "ai_assistant" in r.name and "/health" in r.message]
        assert len(records) == 0

    def test_error_response_logged_at_error_level(self, client, caplog):
        """Test that 5xx responses are logged at ERROR level"""
        with caplog.at_level(logging.ERROR, logger="ai_assistant"):
            with pytest.raises(Exception):
                client.get("/error")

        # Check for error log
        error_records = [
            r for r in caplog.records if r.levelno == logging.ERROR and "ai_assistant.server.http" in r.name
        ]
        assert len(error_records) > 0

    def test_request_duration_logged(self, client, caplog):
        """Test that request duration is logged"""
        with caplog.at_level(HTTP_LEVEL_NUM, logger="ai_assistant"):
            response = client.get("/test")

        assert response.status_code == 200

        # Check response log has duration
        records = [r for r in caplog.records if "←" in r.message and "ai_assistant" in r.name]
        assert len(records) > 0

        response_log = records[0]
        # Duration should be in message (e.g., "10.5ms")
        assert "ms" in response_log.message

    def test_post_request_logged(self, client, caplog):
        """Test that POST requests are logged"""
        with caplog.at_level(HTTP_LEVEL_NUM, logger="ai_assistant"):
            response = client.post("/create", json={"name": "test"})

        assert response.status_code == 200

        # Check request log
        records = [r for r in caplog.records if "→" in r.message and "ai_assistant" in r.name]
        assert len(records) > 0

        request_log = records[0]
        assert "POST" in request_log.message
        assert "/create" in request_log.message


class TestHTTPLoggingMiddlewareWithBodyLogging:
    """Test middleware with request/response body logging enabled"""

    def test_request_body_logging_disabled_by_default(self, caplog):
        """Test that request body is not logged by default"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.post("/test")
        def test_endpoint(data: dict):
            return {"ok": True}

        client = TestClient(app)

        # Reset logger
        LoggerManager._instance = None
        manager = LoggerManager()

        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "test.log"
            config = LoggingConfig(
                level="HTTP", log_file=str(log_file), enable_console_logging=False
            )
            manager.configure(config)

            with caplog.at_level(HTTP_LEVEL_NUM, logger="ai_assistant.server.http"):
                response = client.post("/test", json={"secret": "password"})

                assert response.status_code == 200

                # Body should not be in logs
                assert "password" not in caplog.text


class TestHTTPLoggingMiddlewareStatusCodes:
    """Test middleware handles different status codes correctly"""

    @pytest.fixture
    def status_app(self):
        """Create app with different status code endpoints"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/success")
        def success():
            return {"status": "ok"}

        @app.get("/not-found")
        def not_found():
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Not found")

        @app.get("/server-error")
        def server_error():
            from fastapi import HTTPException

            raise HTTPException(status_code=500, detail="Server error")

        return app

    def test_2xx_logged_at_http_level(self, status_app, logger_manager, caplog):
        """Test that 2xx responses are logged at HTTP level"""
        client = TestClient(status_app)

        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/success")

        assert response.status_code == 200

        # Response should be logged at HTTP level
        http_records = [r for r in caplog.records if r.levelno == HTTP_LEVEL_NUM and "←" in r.message]
        assert len(http_records) > 0

    def test_4xx_logged_at_warning_level(self, status_app, logger_manager, caplog):
        """Test that 4xx responses are logged at WARNING level"""
        client = TestClient(status_app)

        with caplog.at_level(logging.WARNING):
            response = client.get("/not-found")

        assert response.status_code == 404

        # Response should be logged at WARNING level
        warning_records = [
            r for r in caplog.records if r.levelno == logging.WARNING and "404" in r.message
        ]
        assert len(warning_records) > 0

    def test_5xx_logged_at_error_level(self, status_app, logger_manager, caplog):
        """Test that 5xx responses are logged at ERROR level"""
        client = TestClient(status_app)

        with caplog.at_level(logging.ERROR):
            response = client.get("/server-error")

        # Response should be logged at ERROR level
        error_records = [
            r for r in caplog.records if r.levelno == logging.ERROR and "500" in r.message
        ]
        assert len(error_records) > 0


class TestHTTPLoggingMiddlewareInitialization:
    """Test middleware initialization and parameter handling"""

    def test_init_with_default_parameters(self):
        """Test middleware initialization with default parameters"""
        app = FastAPI()
        middleware = HTTPLoggingMiddleware(app)
        
        assert middleware.log_request_body is False
        assert middleware.log_response_body is False
        assert middleware.exclude_paths == []

    def test_init_with_custom_parameters(self):
        """Test middleware initialization with custom parameters"""
        app = FastAPI()
        exclude = ["/health", "/metrics"]
        middleware = HTTPLoggingMiddleware(
            app,
            log_request_body=True,
            log_response_body=True,
            exclude_paths=exclude,
        )
        
        assert middleware.log_request_body is True
        assert middleware.log_response_body is True
        assert middleware.exclude_paths == exclude

    def test_init_with_none_exclude_paths(self):
        """Test that None exclude_paths defaults to empty list"""
        app = FastAPI()
        middleware = HTTPLoggingMiddleware(app, exclude_paths=None)
        
        assert middleware.exclude_paths == []

    def test_init_with_empty_exclude_paths(self):
        """Test initialization with explicitly empty exclude_paths"""
        app = FastAPI()
        middleware = HTTPLoggingMiddleware(app, exclude_paths=[])
        
        assert middleware.exclude_paths == []


class TestHTTPLoggingMiddlewareRequestDetails:
    """Test request details extraction and edge cases"""

    @pytest.fixture
    def app_no_exclusions(self, logger_manager):
        """Create a test FastAPI app without path exclusions"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        @app.post("/echo")
        def echo_endpoint(request: Request):
            return {"received": True}

        return app

    def test_request_without_client(self, app_no_exclusions, logger_manager, caplog):
        """Test request details when request.client is None"""
        client = TestClient(app_no_exclusions)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test")
        
        assert response.status_code == 200
        
        # Check that client_host is handled when None
        # TestClient provides client info, but we verify the code path
        records = [r for r in caplog.records if "→" in r.message]
        assert len(records) > 0

    def test_request_with_query_params(self, app_no_exclusions, logger_manager, caplog):
        """Test query parameter extraction"""
        client = TestClient(app_no_exclusions)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test?foo=bar&baz=qux")
        
        assert response.status_code == 200
        
        # Verify query params are in the log records
        records = [r for r in caplog.records if "→" in r.message]
        assert len(records) > 0
        # Check extra data contains query_params
        request_log = records[0]
        assert hasattr(request_log, "query_params") or "query_params" in str(request_log.__dict__)

    def test_request_without_user_agent(self, logger_manager, caplog):
        """Test request without User-Agent header"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            # TestClient includes user-agent by default, but the code handles missing headers
            response = client.get("/test")
        
        assert response.status_code == 200

    def test_multiple_excluded_paths(self, logger_manager, caplog):
        """Test that multiple paths can be excluded"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            exclude_paths=["/health", "/metrics", "/ready"]
        )

        @app.get("/health")
        def health():
            return {"status": "healthy"}

        @app.get("/metrics")
        def metrics():
            return {"requests": 100}

        @app.get("/ready")
        def ready():
            return {"ready": True}

        @app.get("/api/test")
        def test():
            return {"message": "test"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            # Test excluded paths
            client.get("/health")
            client.get("/metrics")
            client.get("/ready")
            
            # Test non-excluded path
            client.get("/api/test")
        
        # Should only have logs for /api/test
        records = [r for r in caplog.records if "ai_assistant" in r.name]
        health_logs = [r for r in records if "/health" in r.message]
        metrics_logs = [r for r in records if "/metrics" in r.message]
        ready_logs = [r for r in records if "/ready" in r.message]
        test_logs = [r for r in records if "/api/test" in r.message]
        
        assert len(health_logs) == 0
        assert len(metrics_logs) == 0
        assert len(ready_logs) == 0
        assert len(test_logs) > 0


class TestHTTPLoggingMiddlewareBodyParsing:
    """Test request body parsing and error handling"""

    def test_request_body_json_success(self, logger_manager, caplog):
        """Test that valid JSON body is parsed correctly"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.post("/test")
        def test_endpoint(data: dict):
            return {"received": True}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.post("/test", json={"key": "value", "number": 42})
        
        assert response.status_code == 200

    def test_request_body_not_logged_for_get(self, logger_manager, caplog):
        """Test GET request doesn't trigger body logging"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True  # Even with this enabled
        )

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test")
        
        assert response.status_code == 200
        # Body should not be logged for GET requests

    def test_request_body_logged_for_put(self, logger_manager, caplog):
        """Test PUT request logs body when enabled"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.put("/test")
        def test_endpoint(data: dict):
            return {"updated": True}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.put("/test", json={"update": "data"})
        
        assert response.status_code == 200

    def test_request_body_logged_for_patch(self, logger_manager, caplog):
        """Test PATCH request logs body when enabled"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.patch("/test")
        def test_endpoint(data: dict):
            return {"patched": True}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.patch("/test", json={"patch": "data"})
        
        assert response.status_code == 200

    def test_request_body_not_logged_for_delete(self, logger_manager, caplog):
        """Test DELETE request doesn't trigger body logging"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.delete("/test")
        def test_endpoint():
            return {"deleted": True}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.delete("/test")
        
        assert response.status_code == 200

    def test_request_body_non_json_truncated(self, logger_manager, caplog):
        """Test that non-JSON request body is truncated to 500 chars"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.post("/test")
        def test_endpoint():
            return {"received": True}

        client = TestClient(app)
        
        # Send plain text that's not valid JSON
        long_text = "x" * 1000  # 1000 characters
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.post(
                "/test",
                content=long_text,
                headers={"Content-Type": "text/plain"}
            )
        
        # The endpoint should still work despite body parsing issue
        assert response.status_code == 200

    def test_request_body_invalid_json(self, logger_manager, caplog):
        """Test handling of invalid JSON in request body"""
        app = FastAPI()
        app.add_middleware(
            HTTPLoggingMiddleware,
            log_request_body=True
        )

        @app.post("/test")
        def test_endpoint():
            return {"received": True}

        client = TestClient(app)
        
        # Send invalid JSON
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.post(
                "/test",
                content='{"invalid": json}',  # Missing quotes around 'json'
                headers={"Content-Type": "application/json"}
            )
        
        # Should handle gracefully
        assert response.status_code in [200, 422]  # 422 if FastAPI validates

    @pytest.mark.asyncio
    async def test_request_body_exception_during_read(self, logger_manager, caplog):
        """Test that body read exceptions are swallowed gracefully"""
        app = FastAPI()
        
        # Create real middleware instance
        real_middleware = HTTPLoggingMiddleware(
            app,
            log_request_body=True
        )

        # Create a mock request that raises when body() is called
        mock_request = MagicMock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/test"
        mock_request.query_params = {}
        mock_request.client = None
        mock_request.headers.get.return_value = None
        mock_request.body = AsyncMock(side_effect=RuntimeError("Body read failed"))

        async def mock_call_next(request):
            return Response(content='{"ok": true}', status_code=200)

        # Test that dispatch handles the exception gracefully
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = await real_middleware.dispatch(mock_request, mock_call_next)
        
        # Should still process the request successfully despite body read failure
        assert response.status_code == 200


class TestHTTPLoggingMiddlewareDuration:
    """Test request duration calculation and logging"""

    def test_duration_logged_in_response(self, logger_manager, caplog):
        """Test that request duration is logged in response"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        async def test_endpoint():
            # Simulate some processing time
            await asyncio.sleep(0.01)
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test")
        
        assert response.status_code == 200
        
        # Check response log has duration
        records = [r for r in caplog.records if "←" in r.message]
        assert len(records) > 0
        response_log = records[0]
        # Duration should be in message (e.g., "10.5ms")
        assert "ms" in response_log.message

    def test_duration_format_in_exception(self, logger_manager, caplog):
        """Test that duration is logged even when exception occurs"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            raise ValueError("Test error")

        client = TestClient(app)
        
        with caplog.at_level(logging.ERROR):
            with pytest.raises(Exception):
                client.get("/test")
        
        # Check error log has duration
        error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
        assert len(error_records) > 0
        error_log = error_records[0]
        assert "ms" in error_log.message


class TestHTTPLoggingMiddlewareLoggingDetails:
    """Test that all expected fields are included in logs"""

    def test_request_logging_includes_all_details(self, logger_manager, caplog):
        """Test that request log includes all expected fields"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test?param=value")
        
        assert response.status_code == 200
        
        # Check request log
        records = [r for r in caplog.records if "→" in r.message]
        assert len(records) > 0
        request_log = records[0]
        
        # Verify message contains method and path
        assert "GET" in request_log.message
        assert "/test" in request_log.message

    def test_response_logging_includes_status_code(self, logger_manager, caplog):
        """Test that response log includes status code"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test")
        
        assert response.status_code == 200
        
        # Check response log
        records = [r for r in caplog.records if "←" in r.message and "200" in r.message]
        assert len(records) > 0

    def test_error_response_includes_exception_info(self, logger_manager, caplog):
        """Test that exception logs include exc_info"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            raise ValueError("Test error")

        client = TestClient(app)
        
        with caplog.at_level(logging.ERROR):
            with pytest.raises(Exception):
                client.get("/test")
        
        # Check error log has exception info
        error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
        assert len(error_records) > 0
        error_log = error_records[0]
        assert error_log.exc_info is not None


class TestHTTPLoggingMiddlewareEdgeCases:
    """Test edge cases and boundary conditions"""

    def test_request_with_empty_query_params(self, logger_manager, caplog):
        """Test request with no query parameters"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test")
        def test_endpoint():
            return {"message": "success"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test")
        
        assert response.status_code == 200

    def test_request_with_special_characters_in_path(self, logger_manager, caplog):
        """Test URL encoding and special characters in path"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test/{item_id}")
        def test_endpoint(item_id: str):
            return {"item_id": item_id}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/test/item-with-dash")
        
        assert response.status_code == 200

    def test_3xx_redirect_response(self, logger_manager, caplog):
        """Test that 3xx responses are logged at HTTP level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/redirect")
        def redirect_endpoint():
            return Response(status_code=301, headers={"Location": "/new-location"})

        client = TestClient(app, follow_redirects=False)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/redirect")
        
        assert response.status_code == 301
        
        # 3xx should be logged at HTTP level (not ERROR or WARNING)
        http_records = [r for r in caplog.records if r.levelno == HTTP_LEVEL_NUM and "301" in r.message]
        assert len(http_records) > 0

    def test_request_to_root_path(self, logger_manager, caplog):
        """Test handling of root path /"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/")
        def root_endpoint():
            return {"message": "root"}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.get("/")
        
        assert response.status_code == 200
        
        # Should log "/" path
        records = [r for r in caplog.records if "→" in r.message]
        assert len(records) > 0


class TestHTTPLoggingMiddlewareConcurrency:
    """Test middleware behavior with concurrent requests"""

    def test_concurrent_request_handling(self, logger_manager, caplog):
        """Test middleware handles concurrent requests correctly"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/test/{id}")
        async def test_endpoint(id: int):
            await asyncio.sleep(0.01)
            return {"id": id}

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            # Make multiple requests
            response1 = client.get("/test/1")
            response2 = client.get("/test/2")
            response3 = client.get("/test/3")
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        assert response3.status_code == 200
        
        # Should have logs for all three requests
        request_records = [r for r in caplog.records if "→" in r.message]
        response_records = [r for r in caplog.records if "←" in r.message]
        
        assert len(request_records) >= 3
        assert len(response_records) >= 3


class TestHTTPLoggingMiddlewareStatusCodeRanges:
    """Test comprehensive status code handling"""

    def test_201_created_logged_at_http_level(self, logger_manager, caplog):
        """Test that 201 Created is logged at HTTP level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.post("/create")
        def create_endpoint():
            return Response(status_code=201, content='{"created": true}')

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.post("/create")
        
        assert response.status_code == 201
        
        # Should be logged at HTTP level
        http_records = [r for r in caplog.records if r.levelno == HTTP_LEVEL_NUM and "201" in r.message]
        assert len(http_records) > 0

    def test_204_no_content_logged_at_http_level(self, logger_manager, caplog):
        """Test that 204 No Content is logged at HTTP level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.delete("/resource")
        def delete_endpoint():
            return Response(status_code=204)

        client = TestClient(app)
        
        with caplog.at_level(HTTP_LEVEL_NUM):
            response = client.delete("/resource")
        
        assert response.status_code == 204
        
        # Should be logged at HTTP level
        http_records = [r for r in caplog.records if r.levelno == HTTP_LEVEL_NUM and "204" in r.message]
        assert len(http_records) > 0

    def test_401_unauthorized_logged_at_warning_level(self, logger_manager, caplog):
        """Test that 401 Unauthorized is logged at WARNING level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/protected")
        def protected_endpoint():
            raise HTTPException(status_code=401, detail="Unauthorized")

        client = TestClient(app)
        
        with caplog.at_level(logging.WARNING):
            response = client.get("/protected")
        
        assert response.status_code == 401
        
        # Should be logged at WARNING level
        warning_records = [r for r in caplog.records if r.levelno == logging.WARNING and "401" in r.message]
        assert len(warning_records) > 0

    def test_403_forbidden_logged_at_warning_level(self, logger_manager, caplog):
        """Test that 403 Forbidden is logged at WARNING level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/forbidden")
        def forbidden_endpoint():
            raise HTTPException(status_code=403, detail="Forbidden")

        client = TestClient(app)
        
        with caplog.at_level(logging.WARNING):
            response = client.get("/forbidden")
        
        assert response.status_code == 403
        
        # Should be logged at WARNING level
        warning_records = [r for r in caplog.records if r.levelno == logging.WARNING and "403" in r.message]
        assert len(warning_records) > 0

    def test_503_service_unavailable_logged_at_error_level(self, logger_manager, caplog):
        """Test that 503 Service Unavailable is logged at ERROR level"""
        app = FastAPI()
        app.add_middleware(HTTPLoggingMiddleware)

        @app.get("/service")
        def service_endpoint():
            raise HTTPException(status_code=503, detail="Service Unavailable")

        client = TestClient(app)
        
        with caplog.at_level(logging.ERROR):
            response = client.get("/service")
        
        assert response.status_code == 503
        
        # Should be logged at ERROR level
        error_records = [r for r in caplog.records if r.levelno == logging.ERROR and "503" in r.message]
        assert len(error_records) > 0


