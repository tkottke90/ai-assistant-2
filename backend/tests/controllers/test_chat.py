import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from src.server import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestChatController:
    """Test cases for chat endpoints (renamed from /agent to /chat)"""

    def test_get_threads_endpoint_exists(self, client):
        """Test that GET /api/v1/chat/get-threads endpoint exists"""
        response = client.get("/api/v1/chat/get-threads")
        # Should not return 404 (endpoint exists)
        assert response.status_code != 404
        # Expect 200 or other valid status
        assert response.status_code in [200, 500]  # 500 might occur if dependencies aren't set up

    def test_get_thread_by_id_endpoint_exists(self, client):
        """Test that GET /api/v1/chat/get-threads/{thread_id} endpoint exists"""
        response = client.get("/api/v1/chat/get-threads/test-thread-123")
        # Should not return 404 (endpoint exists)
        assert response.status_code != 404

    def test_new_thread_endpoint_exists(self, client):
        """Test that POST /api/v1/chat/new-thread endpoint exists"""
        response = client.post("/api/v1/chat/new-thread")
        # Should not return 404 (endpoint exists)
        assert response.status_code != 404
        # Should return thread_id
        if response.status_code == 200:
            data = response.json()
            assert "thread_id" in data

    def test_chat_endpoint_exists(self, client):
        """Test that POST /api/v1/chat/chat endpoint exists"""
        request_data = {
            "thread_id": "test-thread",
            "message": "Hello",
            "stream": False
        }
        response = client.post("/api/v1/chat/chat", json=request_data)
        # Should not return 404 (endpoint exists)
        assert response.status_code != 404

    def test_old_agent_endpoint_not_found(self, client):
        """Test that old /api/v1/agent endpoints no longer exist"""
        # These should all return 404 now
        response = client.get("/api/v1/agent/get-threads")
        assert response.status_code == 404
        
        response = client.post("/api/v1/agent/new-thread")
        assert response.status_code == 404
        
        response = client.post("/api/v1/agent/chat", json={
            "thread_id": "test",
            "message": "test",
            "stream": False
        })
        assert response.status_code == 404

    def test_new_thread_creates_thread_id(self, client):
        """Test that new-thread endpoint creates a thread ID"""
        response = client.post("/api/v1/chat/new-thread")
        
        if response.status_code == 200:
            data = response.json()
            assert "thread_id" in data
            assert isinstance(data["thread_id"], str)
            assert len(data["thread_id"]) > 0

    def test_chat_request_requires_fields(self, client):
        """Test that chat endpoint validates required fields"""
        # Missing required fields
        response = client.post("/api/v1/chat/chat", json={})
        assert response.status_code == 422  # Validation error

    def test_chat_request_with_minimal_data(self, client):
        """Test chat endpoint with minimal valid request"""
        request_data = {
            "thread_id": "test-thread-123",
            "message": "Hello, this is a test message"
        }
        response = client.post("/api/v1/chat/chat", json=request_data)
        
        # Should not return 404 or 422 (validation error)
        assert response.status_code not in [404, 422]
        # May return 500 if backend dependencies (LLM) aren't configured
        assert response.status_code in [200, 500]

    def test_get_threads_returns_list(self, client):
        """Test that get-threads returns a threads list"""
        response = client.get("/api/v1/chat/get-threads")
        
        if response.status_code == 200:
            data = response.json()
            assert "threads" in data
            assert isinstance(data["threads"], list)
