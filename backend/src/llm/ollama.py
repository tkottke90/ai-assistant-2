from typing import Optional
from langchain_ollama import ChatOllama
from .base import LLMClientMixin
from ..config.models.llm import OllamaConfig
import httpx

class OllamaClient(LLMClientMixin, ChatOllama):

    def __init__(self, clientConfig: OllamaConfig, model: Optional[str] = None):
        super().__init__(
            model=model or clientConfig.default_model,
            base_url=str(clientConfig.base_url),
            temperature=clientConfig.temperature,
            top_p=clientConfig.top_p,
            top_k=clientConfig.top_k,
        )

        self.__config = clientConfig

    def check_availability(self) -> bool:
        try:
            # Attempt to list models as a way to check availability
            self.get_model_list()

            return True
        except Exception:
            return False
        
    def check_token_budget(self, input: str) -> bool:
        if not self.__config.max_context_tokens:
            return True

        if self.__config.max_context_tokens < 0:
            return True

        num_tokens = self.get_num_tokens(input)

        return num_tokens <= self.__config.max_context_tokens
        
    def get_model_list(self) -> list[str]:
        try:
            response = httpx.get(f"{self.__config.base_url}/api/tags", timeout=20.0)
            
            if response.status_code != 200:
                raise RuntimeError(
                    f"Failed to fetch model list from Ollama API (at {self.__config.base_url}): "
                    f"{response.text} (status code {response.status_code})"
                )
            
            data = response.json()
            
            if not isinstance(data, dict) or "models" not in data:
                raise RuntimeError(
                    f"Invalid response structure from Ollama API: expected 'models' key in response"
                )
            
            models = data.get("models", [])
            if not isinstance(models, list):
                raise RuntimeError(
                    f"Invalid response structure from Ollama API: 'models' should be a list"
                )
            
            return [model.get("name") for model in models if isinstance(model, dict) and "name" in model]
            
        except httpx.ConnectError as e: # Handle connection errors
            raise RuntimeError(f"Failed to connect to Ollama API at {self.__config.base_url}: {str(e)}")
        
        except httpx.TimeoutException as e: # Handle Timeout errors
            raise RuntimeError(f"Timeout while connecting to Ollama API at {self.__config.base_url}: {str(e)}")
        
        except httpx.HTTPError as e: # General HTTP errors
            raise RuntimeError(f"HTTP error while fetching model list from Ollama API: {str(e)}")
        
        except ValueError as e: # Handle JSON decode errors
            raise RuntimeError(f"Failed to parse JSON response from Ollama API: {str(e)}")
    
    def measure_model_token_usage(self, input: str, model: str = None) -> int:
        llm = self;

        if (model):
            llm = OllamaClient(
                clientConfig=self.__config,
                model=model
            )

        return llm.get_num_tokens(input)

    def set_model(self, model: str) -> None:
        self.model = model

    def set_temperature(self, temperature):
        self.temperature = temperature

