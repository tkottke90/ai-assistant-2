from ..config.models.llm import ContextOverflowStrategy, LLMConfigBase
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.messages import AIMessage, AnyMessage
from langgraph.runtime import Runtime
from langchain_core.callbacks import UsageMetadataCallbackHandler
from typing import Any, Annotated
import operator

class NoPricingDefinedError(Exception):
    """
    Exception raised when no pricing structure is defined that can be used
    to estimate LLM usage costs.
    """
    err_code: int = 4001
    
    pass

class ContextState(AgentState):
  inputTokens: Annotated[int, operator.add]
  outputTokens: Annotated[int, operator.add]
  totalTokens: Annotated[int, operator.add]

class ContextWindowManager(AgentMiddleware):
    """
    ContextWindowManager - A utility for managing LLM context windows based on the llm configuration including
    token and activity limits, plus overflow strategies for handling context that exceeds those limits.

    Usage:

        context_manager = ContextWindowManager(config=llm_config)
        agent = create_agent(
            model=llm,
            system_prompt="Your system prompt here",
            middleware=[context_manager]
        )

        # Invoke the Agent
        response = agent.invoke("Your user prompt here", config={ "callbacks": [context_manager.counter] })

        print(context_manager.estimate_cost())
    """

    __llm_config: LLMConfigBase
    __counter: UsageMetadataCallbackHandler

    def __init__(self, *, config: LLMConfigBase):
        self.__llm_config = config
        self.max_context_tokens = config.max_context_tokens
        self.max_context_activities = config.max_context_activities

        # Default to truncation if no strategy provided because it is safer
        self.overflow_strategy = config.context_overflow_strategy or ContextOverflowStrategy.TRUNCATE

        # Create our centralized usage counter
        self.__counter = UsageMetadataCallbackHandler()

    @property
    def counter(self) -> UsageMetadataCallbackHandler:
        return self.__counter

    def after_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
      """
      Defining the content window manager as a middleware allows us to build into the agent
      a consistent way to manage context windows across different LLM providers.

      This method would be called after the model invocation, allowing us to analyze
      the messages exchanged and adjust the context window as needed based on token usage.
      """
      usage = self.counter.usage_metadata

      for value in usage.values():
        if "input_tokens" in value:
            inputTokens += value.get("input_tokens", 0)
        
        if "output_tokens" in value:
            outputTokens += value.get("output_tokens", 0)
        
        if "total_tokens" in value:
            totalTokens += value.get("total_tokens", 0)

      return { 
        "inputTokens": inputTokens,
        "outputTokens": outputTokens,
        "totalTokens": totalTokens
      }


    def estimate_cost(self, response: dict) -> list[AnyMessage]:
      """
      Estimates the cost of the LLM invocation based on usage metadata collected during call or
      agent execution.
      """

      cost = 0.0

      if not self.__llm_config.pricing:
        return cost

      for model, usage_data in response.get('usage_metadata', dict()).items():
        # Check for pricing model matching the model
        pricing = self.__llm_config.pricing.get(model)
        
        # If not found, then find default pricing (identified by applies_to_model='*')
        if not pricing:
          pricing = self.__llm_config.pricing.get("*")

        if not pricing:
          raise NoPricingDefinedError(
              "No pricing structure defined for LLM usage.  Cannot estimate cost."
          )
        
        prompt_tokens = usage_data.get('prompt_tokens', 0)
        completion_tokens = usage_data.get('completion_tokens', 0)

        if pricing.pricing_scale == ContextOverflowStrategy.PER_K_TOKENS:
          multiplier = 1_000.0
        elif pricing.pricing_scale == ContextOverflowStrategy.PER_M_TOKENS:
          multiplier = 1_000_000.0
        else:
          multiplier = 1.0

        cost += (
          # Input Prompt cost
          (prompt_tokens / multiplier) * pricing.prompt_cost_per_1k_tokens +
          # Output Completion cost
          (completion_tokens / multiplier) * pricing.completion_cost_per_1k_tokens
        )

      return cost