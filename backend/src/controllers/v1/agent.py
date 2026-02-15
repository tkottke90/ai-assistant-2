from ...config.manager import ConfigManager, get_config_manager
from ...config.models.llm import LLMConfig
from ...database import get_checkpointer
from ...llm.context_window_manager import ContextWindowManager
from ...llm.factory import LlmFactory, get_llm_factory
from datetime import datetime
from fastapi import APIRouter, Depends
from langchain_core.runnables import RunnableConfig
from langchain.agents import create_agent
from pydantic import BaseModel
from ...logging import get_logger

from ...dao import (
   activities as ActivityDao,
   threads as ThreadDao
)

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
  activities = ActivityDao.getThreadHistory(thread_id)

  chatHistory = []
  for activity in [a for a in activities]:
    chatHistory.extend(activity.to_chat_messages())

  return {
    "thread_id": thread_id,
    "activities": activities,
    "chat_history": chatHistory
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

  # Gets the LLM Config
  llm_cfg: LLMConfig = config_manager.get_config("llm")

  # Sets up thge LLM
  llm = llm_factory.create_llm_with_config(llm_cfg.get_default_provider())
  context_manager = ContextWindowManager(config=llm_cfg.get_default_provider())

  agent = create_agent(
    model=llm,
    checkpointer=get_checkpointer()
  );

  # Triggers the agent with the user message
  response = agent.invoke(
    { "messages": request.message },
    {
      **__construct_thread_config(request.thread_id),
      "callbacks": [context_manager.counter] 
    }
  )
  
  # Get the most recent messages from the thread
  messages = response['messages'][-2:];

  # Async save new messages as an Activity
  activity = ActivityDao.createChatActivity(
    thread_id=request.thread_id,
    messages=messages,
    metadata={
      "llm": {
         "engine": llm_cfg.get_default_provider().type,
         "model": llm_cfg.get_default_provider().default_model,
      },
      "usage": context_manager.counter.usage_metadata,
      "cost": context_manager.estimate_cost(context_manager.counter.usage_metadata)
    }
  )

  return { 
     "thread_id": request.thread_id,
     "activities": [ activity ],
     "message": activity.to_chat_messages(),
  }


def __construct_thread_config(threadId: str) -> RunnableConfig:
    return {
        "configurable": {
            "thread_id": threadId
        }
    }