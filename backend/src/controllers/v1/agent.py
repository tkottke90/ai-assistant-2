from ...config.manager import ConfigManager, get_config_manager
from ...config.models.llm import LLMConfig
from ...database import get_checkpointer
from ...llm.context_window_manager import ContextWindowManager
from ...llm.factory import LlmFactory, get_llm_factory
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from langchain_core.runnables import RunnableConfig
from langchain.agents import create_agent
from pydantic import BaseModel

from ...dao import threads as ThreadDao

router = APIRouter(prefix="/agent", tags=["agent"])

@router.get("/get-threads")
def get_threads():
  """
  Get list of chat threads
  """
  return {
    "threads": ThreadDao.get_threads()
  }

@router.get("/get-threads/{thread_id}")
def get_thread(thread_id: str):
  """
  Get chat thread by ID
  """
  return {
    "thread_id": thread_id,
    "messages": ThreadDao.get_thread_messages(thread_id)
  }

@router.post("/new-thread")
def new_thread():
  """
  Create a new chat thread
  """
  return {
    "thread_id": str(int(datetime.now().timestamp()))
  }

class ChatRequest(BaseModel):
    """Request Body for chat endpoint"""

    thread_id: str
    message: str
    stream: bool = False

@router.post("/chat")
def chat(
  request: ChatRequest,
  llm_factory: LlmFactory = Depends(get_llm_factory),
  config_manager: ConfigManager = Depends(get_config_manager)
):
  """
  Chat endpoint
  """

  llm_cfg: LLMConfig = config_manager.get_config("llm")

  llm = llm_factory.create_llm_with_config(llm_cfg.get_default_provider())
  context_manager = ContextWindowManager(config=llm_cfg.get_default_provider())

  agent = create_agent(
    model=llm,
    checkpointer=get_checkpointer()
  );

  response = agent.invoke(
    { "messages": request.message },
    {
      **__construct_thread_config(request.thread_id),
      "callbacks": [context_manager.counter] 
    }
  )
  
  return { "message": response['messages'][-1].content }


def __construct_thread_config(threadId: str) -> RunnableConfig:
    return {
        "configurable": {
            "thread_id": threadId
        }
    }