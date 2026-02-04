from fastapi import APIRouter, Depends, Query
from ...llm.factory import LlmFactory, get_llm_factory
from ...config.manager import ConfigManager, get_config_manager
from ...config.models.llm import LLMConfig
from ...llm.context_window_manager import ContextWindowManager

router = APIRouter()

@router.get("/chat")
def chat(
  message: str,
  stream: bool = Query(default=False, description="Stream response"),
  llm_factory: LlmFactory = Depends(get_llm_factory),
  config_manager: ConfigManager = Depends(get_config_manager)
):
  """
  Chat endpoint
  """
  agent_cfg = config_manager.get_config("agent")
  llm_cfg: LLMConfig = config_manager.get_config("llm")

  llm = llm_factory.create_llm_with_config(llm_cfg.get_default_provider())

  context_manager = ContextWindowManager(config=llm_cfg.get_default_provider())

  if stream:
    return llm.stream(message, { "callbacks": [context_manager.counter] })
  else:
    response = llm.invoke(message, { "callbacks": [context_manager.counter] })
  
  return { "message": response.content }
