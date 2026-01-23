import time
import json
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .manager import get_logger

logger = get_logger("server.http")


class HTTPLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all HTTP requests and responses

    Logs at HTTP level (15) for request/response details
    Logs at ERROR level for 5xx responses
    Logs at WARNING level for 4xx responses
    """

    def __init__(
        self,
        app: ASGIApp,
        log_request_body: bool = False,
        log_response_body: bool = False,
        exclude_paths: list[str] | None = None,
    ):
        """
        Initialize HTTP logging middleware

        Args:
            app: ASGI application
            log_request_body: Whether to log request body (default: False for security)
            log_response_body: Whether to log response body (default: False for performance)
            exclude_paths: List of paths to exclude from logging (e.g., ["/health"])
        """
        super().__init__(app)
        self.log_request_body = log_request_body
        self.log_response_body = log_response_body
        self.exclude_paths = exclude_paths or []

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log details"""

        # Skip logging for excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)

        # Start timing
        start_time = time.time()

        # Extract request details
        request_details = {
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "client_host": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        }

        # Optionally log request body
        if self.log_request_body and request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                # Try to parse as JSON for better logging
                try:
                    request_details["body"] = json.loads(body.decode())
                except (json.JSONDecodeError, UnicodeDecodeError):
                    request_details["body"] = body.decode()[:500]  # Limit size
            except Exception:
                pass

        # Log incoming request
        logger.http("→ %s %s", request.method, request.url.path, extra=request_details)

        # Process request
        try:
            response = await call_next(request)
        except Exception as e:
            # Log exception
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                "✗ %s %s - Exception: %s - %.2fms",
                request.method,
                request.url.path,
                str(e),
                duration_ms,
                exc_info=True,
                extra={**request_details, "duration_ms": duration_ms},
            )
            raise

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Response details
        response_details = {
            **request_details,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        }

        # Log response at appropriate level
        if response.status_code >= 500:
            # Server errors - ERROR level
            logger.error(
                "← %s %s - %d - %.2fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                extra=response_details,
            )
        elif response.status_code >= 400:
            # Client errors - WARNING level
            logger.warning(
                "← %s %s - %d - %.2fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                extra=response_details,
            )
        else:
            # Success - HTTP level
            logger.http(
                "← %s %s - %d - %.2fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                extra=response_details,
            )

        return response

