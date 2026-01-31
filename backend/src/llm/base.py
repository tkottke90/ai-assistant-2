from abc import ABC, abstractmethod
from langchain_core.callbacks import UsageMetadataCallbackHandler

# Base Language Model Class
# https://reference.langchain.com/python/langchain_core/language_models/#langchain_core.language_models

class LLMClientMixin(ABC):

    @abstractmethod
    def check_availability(self) -> bool:
        """
        Check if the LLM service is available.

        Returns:
            bool: True if service is reachable, False otherwise.
        """
        ...
        

    @abstractmethod
    def check_token_budget(self, input: str) -> bool:
        """
        Check if the input exceeds the token budget.

        Args:
            input (str): The input text to check.
        Returns:
            bool: True if within budget, False if exceeded.
        """
        ...

    @abstractmethod
    def get_model_list(self) -> list[str]:
        """
        Retrieve the list of available models.

        Returns:
            list[str]: A list of model names available.
        """
        ...

    @abstractmethod
    def measure_model_token_usage(self, input: str, model: str = None) -> int:
        """
        Measure the token usage for a given input and (optionally) model.  Defaults
        to the client's configured model if none is provided.  This allows you to assess
        how a body of text will be tokenized by a specific model.

        Args:
            input (str): The input text to measure.
            model (str, optional): The model to use for token measurement. Defaults to None.
        """
        ...

    @abstractmethod
    def set_model(self, model: str) -> None:
        """
        Set the active model for the client.

        Args:
            model (str): The model name to set.
        """
        ...

    @abstractmethod
    def set_temperature(self, temperature: float) -> None:
        """
        Set the temperature for the client.

        Args:
            temperature (float): The temperature value to set.
        """ 
        ...
