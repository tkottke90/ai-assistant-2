import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from src.server import app
from src.database import init_db, get_cursor


@pytest.fixture
def test_db():
    """Setup test database"""
    # Create a temporary database for testing
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_file:
        db_path = tmp_file.name
    
    # Initialize database
    init_db(db_path)
    
    yield db_path
    
    # Cleanup
    Path(db_path).unlink(missing_ok=True)


@pytest.fixture
def client(test_db):
    """Create test client with test database"""
    return TestClient(app)


@pytest.fixture
def sample_agent_data():
    """Sample agent data for testing"""
    return {
        "name": "TestAgent",
        "description": "A test agent for unit testing",
        "prompt_template": "You are a test assistant. {instruction}",
        "variables": {"instruction": "Help users with testing"},
        "version": 1.0,
        "sections": []
    }


class TestAgentsController:
    """Test cases for agents CRUD endpoints"""

    def test_list_agents_empty(self, client):
        """Test listing agents when database is empty"""
        response = client.get("/api/v1/agents")
        assert response.status_code == 200
        data = response.json()
        assert data["agents"] == []
        assert data["total"] == 0
        assert data["limit"] == 50
        assert data["offset"] == 0

    def test_list_agents_with_pagination_params(self, client):
        """Test listing agents with custom pagination parameters"""
        response = client.get("/api/v1/agents?limit=10&offset=5")
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 10
        assert data["offset"] == 5

    def test_list_agents_invalid_pagination(self, client):
        """Test listing agents with invalid pagination parameters"""
        # Limit too high
        response = client.get("/api/v1/agents?limit=200")
        assert response.status_code == 422
        
        # Negative offset
        response = client.get("/api/v1/agents?offset=-1")
        assert response.status_code == 422

    def test_create_agent_success(self, client, sample_agent_data):
        """Test successfully creating an agent"""
        response = client.post("/api/v1/agents", json=sample_agent_data)
        assert response.status_code == 201
        data = response.json()
        assert data["properties"]["name"] == sample_agent_data["name"]
        assert data["properties"]["description"] == sample_agent_data["description"]
        assert data["type"] == "agent"
        assert "id" in data
        assert "created_at" in data

    def test_create_agent_duplicate_name(self, client, sample_agent_data):
        """Test creating an agent with duplicate name returns 409"""
        # Create first agent
        response1 = client.post("/api/v1/agents", json=sample_agent_data)
        assert response1.status_code == 201
        
        # Try to create second agent with same name
        response2 = client.post("/api/v1/agents", json=sample_agent_data)
        assert response2.status_code == 409
        assert "already exists" in response2.json()["detail"].lower()

    def test_create_agent_invalid_data(self, client):
        """Test creating an agent with invalid data returns 422"""
        invalid_data = {
            "name": "TestAgent",
            # Missing required fields
        }
        response = client.post("/api/v1/agents", json=invalid_data)
        assert response.status_code == 422

    def test_get_agent_success(self, client, sample_agent_data):
        """Test successfully retrieving an agent by ID"""
        # Create an agent first
        create_response = client.post("/api/v1/agents", json=sample_agent_data)
        agent_id = create_response.json()["id"]
        
        # Get the agent
        response = client.get(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == agent_id
        assert data["properties"]["name"] == sample_agent_data["name"]

    def test_get_agent_not_found(self, client):
        """Test getting a non-existent agent returns 404"""
        response = client.get("/api/v1/agents/99999")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_agent_success(self, client, sample_agent_data):
        """Test successfully updating an agent"""
        # Create an agent first
        create_response = client.post("/api/v1/agents", json=sample_agent_data)
        agent_id = create_response.json()["id"]
        
        # Update the agent
        updated_data = sample_agent_data.copy()
        updated_data["description"] = "Updated description"
        updated_data["version"] = 2.0
        
        response = client.put(f"/api/v1/agents/{agent_id}", json=updated_data)
        assert response.status_code == 200
        data = response.json()
        assert data["properties"]["description"] == "Updated description"
        assert data["properties"]["version"] == 2.0

    def test_update_agent_not_found(self, client, sample_agent_data):
        """Test updating a non-existent agent returns 404"""
        response = client.put("/api/v1/agents/99999", json=sample_agent_data)
        assert response.status_code == 404

    def test_update_agent_duplicate_name(self, client, sample_agent_data):
        """Test updating an agent to a duplicate name returns 409"""
        # Create first agent
        agent1_data = sample_agent_data.copy()
        agent1_data["name"] = "Agent1"
        response1 = client.post("/api/v1/agents", json=agent1_data)
        agent1_id = response1.json()["id"]
        
        # Create second agent
        agent2_data = sample_agent_data.copy()
        agent2_data["name"] = "Agent2"
        response2 = client.post("/api/v1/agents", json=agent2_data)
        agent2_id = response2.json()["id"]
        
        # Try to update agent2 to have agent1's name
        agent2_data["name"] = "Agent1"
        response = client.put(f"/api/v1/agents/{agent2_id}", json=agent2_data)
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"].lower()

    def test_delete_agent_success(self, client, sample_agent_data):
        """Test successfully deleting an agent"""
        # Create an agent first
        create_response = client.post("/api/v1/agents", json=sample_agent_data)
        agent_id = create_response.json()["id"]
        
        # Delete the agent
        response = client.delete(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 204
        
        # Verify agent is gone
        get_response = client.get(f"/api/v1/agents/{agent_id}")
        assert get_response.status_code == 404

    def test_delete_agent_not_found(self, client):
        """Test deleting a non-existent agent returns 404"""
        response = client.delete("/api/v1/agents/99999")
        assert response.status_code == 404

    def test_full_crud_workflow(self, client, sample_agent_data):
        """Test complete CRUD workflow"""
        # Create
        create_response = client.post("/api/v1/agents", json=sample_agent_data)
        assert create_response.status_code == 201
        agent_id = create_response.json()["id"]
        
        # Read
        get_response = client.get(f"/api/v1/agents/{agent_id}")
        assert get_response.status_code == 200
        
        # List (should contain our agent)
        list_response = client.get("/api/v1/agents")
        assert list_response.status_code == 200
        assert list_response.json()["total"] == 1
        
        # Update
        updated_data = sample_agent_data.copy()
        updated_data["version"] = 2.0
        update_response = client.put(f"/api/v1/agents/{agent_id}", json=updated_data)
        assert update_response.status_code == 200
        
        # Delete
        delete_response = client.delete(f"/api/v1/agents/{agent_id}")
        assert delete_response.status_code == 204
        
        # Verify deletion
        final_list = client.get("/api/v1/agents")
        assert final_list.json()["total"] == 0

    def test_list_agents_pagination_after_create(self, client, sample_agent_data):
        """Test pagination works correctly after creating multiple agents"""
        # Create 5 agents
        agent_ids = []
        for i in range(5):
            data = sample_agent_data.copy()
            data["name"] = f"Agent{i}"
            response = client.post("/api/v1/agents", json=data)
            assert response.status_code == 201
            agent_ids.append(response.json()["id"])
        
        # Test pagination
        response = client.get("/api/v1/agents?limit=2&offset=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["agents"]) == 2
        assert data["total"] == 5
        
        # Get next page
        response = client.get("/api/v1/agents?limit=2&offset=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["agents"]) == 2
        assert data["total"] == 5
