from langchain.agents import create_agent
from ..database import get_checkpointer
from ..config.models.llm import LLMProviderConfig
from ..llm.factory import LlmFactory, get_llm_factory

class AgentFactory:
  @staticmethod
  def create_agent_with_middleware(
    name: str,
    llm_cfg: LLMProviderConfig,
    llm_factory: LlmFactory,
    middleware: list
  ) -> any:
    
    model = llm_factory.create_llm_with_config(llm_cfg)
    
    return create_agent(
      model=model,
      system_prompt=system_prompt,
      middleware=middleware,
      checkpointer=get_checkpointer()
    )