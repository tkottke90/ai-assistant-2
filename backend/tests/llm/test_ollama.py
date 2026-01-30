"""
Unit tests for the OllamaClient class.

This module tests the Ollama LLM provider client implementation,
focusing on testable behavior without complex mocking of Pydantic models.
"""

import pytest
from unittest.mock import patch, Mock
import httpx

from src.llm.ollama import OllamaClient
from src.config.models.llm import OllamaConfig


@pytest.fixture
def ollama_config():
    """Create a default OllamaConfig for testing"""
    return OllamaConfig(
        base_url="http://localhost:11434",
        default_model="mistral:7b",
        temperature=0.7,
        top_p=0.9,
        top_k=40,
        max_context_tokens=3000,
    )


class TestOllamaClientInitialization:
    """Tests for OllamaClient initialization"""
    
    def test_init_with_default_model(self, ollama_config):
        """Should initialize with default model from config"""
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.model == "mistral:7b"
        # Note: base_url gets trailing slash added by HttpUrl
        assert client.base_url.startswith("http://localhost:11434")
        assert client.temperature == 0.7
        assert client.top_p == 0.9
        assert client.top_k == 40

    def test_init_with_custom_model(self, ollama_config):
        """Should initialize with custom model override"""
        client = OllamaClient(clientConfig=ollama_config, model="llama2:13b")
        
        assert client.model == "llama2:13b"
        assert client.temperature == 0.7

    def test_init_with_custom_parameters(self):
        """Should initialize with custom config parameters"""
        config = OllamaConfig(
            base_url="http://remote-ollama:11434",
            default_model="codellama:7b",
            temperature=1.2,
            top_p=0.95,
            top_k=50,
        )
        client = OllamaClient(clientConfig=config)
        
        assert client.model == "codellama:7b"
        assert client.base_url.startswith("http://remote-ollama:11434")


class TestCheckAvailability:
    """Tests for check_availability method"""
    
    @patch('src.llm.ollama.httpx.get')
    def test_check_availability_success(self, mock_get, ollama_config):
        """Should return True when Ollama service is available"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "mistral:7b"}]}
        mock_get.return_value = mock_response
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_availability() is True

    @patch('src.llm.ollama.httpx.get')
    def test_check_availability_connection_error(self, mock_get, ollama_config):
        """Should return False on connection error"""
        mock_get.side_effect = httpx.ConnectError("Connection refused")
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_availability() is False

    @patch('src.llm.ollama.httpx.get')
    def test_check_availability_timeout(self, mock_get, ollama_config):
        """Should return False on timeout"""
        mock_get.side_effect = httpx.TimeoutException("Timeout")
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_availability() is False

    @patch('src.llm.ollama.httpx.get')
    def test_check_availability_generic_exception(self, mock_get, ollama_config):
        """Should return False on any exception"""
        mock_get.side_effect = Exception("Unexpected error")
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_availability() is False


class TestCheckTokenBudget:
    """Tests for check_token_budget method"""
    
    @patch.object(OllamaClient, 'get_num_tokens')
    def test_check_token_budget_within_limit(self, mock_get_tokens, ollama_config):
        """Should return True when tokens are within budget"""
        mock_get_tokens.return_value = 1000
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("Some input text") is True
        mock_get_tokens.assert_called_once_with("Some input text")

    @patch.object(OllamaClient, 'get_num_tokens')
    def test_check_token_budget_exceeds_limit(self, mock_get_tokens, ollama_config):
        """Should return False when tokens exceed budget"""
        mock_get_tokens.return_value = 5000  # Exceeds max_context_tokens=3000
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("Some very long input text") is False

    @patch.object(OllamaClient, 'get_num_tokens')
    def test_check_token_budget_at_limit(self, mock_get_tokens, ollama_config):
        """Should return True when tokens equal the budget"""
        mock_get_tokens.return_value = 3000  # Exactly at max_context_tokens
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("Input at limit") is True

    @patch.object(OllamaClient, 'get_num_tokens')
    def test_check_token_budget_zero_tokens(self, mock_get_tokens, ollama_config):
        """Should return True for zero tokens"""
        mock_get_tokens.return_value = 0
        
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("") is True

    def test_check_token_budget_no_limit_set(self, ollama_config):
        """Should return True when max_context_tokens is None"""
        ollama_config.max_context_tokens = None
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("Any input") is True

    def test_check_token_budget_negative_limit(self, ollama_config):
        """Should return True when max_context_tokens is negative (unlimited)"""
        ollama_config.max_context_tokens = -1
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.check_token_budget("Any input") is True


class TestSetModel:
    """Tests for set_model method"""
    
    def test_set_model_updates_model_attribute(self, ollama_config):
        """Should update the model attribute"""
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.model == "mistral:7b"
        
        client.set_model("llama2:13b")
        
        assert client.model == "llama2:13b"

    def test_set_model_multiple_times(self, ollama_config):
        """Should allow model to be changed multiple times"""
        client = OllamaClient(clientConfig=ollama_config)
        
        client.set_model("llama2:13b")
        assert client.model == "llama2:13b"
        
        client.set_model("codellama:7b")
        assert client.model == "codellama:7b"


class TestSetTemperature:
    """Tests for set_temperature method"""
    
    def test_set_temperature_updates_value(self, ollama_config):
        """Should update the temperature attribute"""
        client = OllamaClient(clientConfig=ollama_config)
        
        assert client.temperature == 0.7
        
        client.set_temperature(1.2)
        
        assert client.temperature == 1.2

    def test_set_temperature_zero(self, ollama_config):
        """Should allow temperature to be set to 0 (deterministic)"""
        client = OllamaClient(clientConfig=ollama_config)
        
        client.set_temperature(0.0)
        
        assert client.temperature == 0.0

    def test_set_temperature_max(self, ollama_config):
        """Should allow temperature to be set to maximum value"""
        client = OllamaClient(clientConfig=ollama_config)
        
        client.set_temperature(2.0)
        
        assert client.temperature == 2.0

    def test_set_temperature_multiple_times(self, ollama_config):
        """Should allow temperature to be changed multiple times"""
        client = OllamaClient(clientConfig=ollama_config)
        
        client.set_temperature(0.5)
        assert client.temperature == 0.5
        
        client.set_temperature(1.5)
        assert client.temperature == 1.5
        
        client.set_temperature(0.9)
        assert client.temperature == 0.9


class TestIntegrationScenarios:
    """Integration tests for common workflows"""
    
    @patch('src.llm.ollama.httpx.get')
    def test_full_workflow_check_availability_and_get_models(self, mock_get, ollama_config):
        """Should handle complete workflow of checking availability and listing models"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [{"name": "mistral:7b"}, {"name": "llama2:13b"}]
        }
        mock_get.return_value = mock_response
        
        client = OllamaClient(clientConfig=ollama_config)
        
        # Check availability
        assert client.check_availability() is True
        
        # Get models
        models = client.get_model_list()
        assert len(models) == 2
        assert "mistral:7b" in models

    @patch.object(OllamaClient, 'get_num_tokens')
    def test_check_budget_before_inference(self, mock_get_tokens, ollama_config):
        """Should check token budget before proceeding with inference"""
        mock_get_tokens.return_value = 2000
        
        client = OllamaClient(clientConfig=ollama_config)
        input_text = "Some input for LLM"
        
        # Check budget first
        within_budget = client.check_token_budget(input_text)
        assert within_budget is True
        
        # Proceed with inference (simulated)
        # In real usage, would call client.invoke() or similar


class TestEdgeCases:
    """Tests for edge cases and special scenarios"""
    
    def test_custom_base_url(self):
        """Should work with custom Ollama server URL"""
        config = OllamaConfig(
            base_url="http://remote-server:8080",
            default_model="mistral:7b",
        )
        client = OllamaClient(clientConfig=config)
        
        assert client.base_url.startswith("http://remote-server:8080")
