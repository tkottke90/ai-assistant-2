from pydantic import BaseModel, Field
from .prompt_base import PromptNodeProperties
from .graph import Node

migrations = [
  """
  CREATE VIEW IF NOT EXISTS agent_view AS
  SELECT
    node_id,
    type,
    json_extract(properties, '$.name') AS name,
    json_extract(properties, '$.description') AS description,
    properties,
    created_at,
    updated_at
  FROM node
  WHERE type = 'agent'
  """
]

class AgentNodeProperties(PromptNodeProperties):
  name: str = Field(..., description="Name of the agent, e.g. 'WeatherBot'")
  description: str = Field(..., description="Description of the agent's purpose and capabilities, e.g. 'An agent that provides weather forecasts based on user queries.'")

class Agent(Node[AgentNodeProperties]):
  """
  An Agent is defined as a system prompt which describes how an LLM should be behave.  Agents typically work on multiple
  tasks by reasoning through the instructions step by step.  They use all the information in the context window to keep track
  of information.  They use tools to interact with external systems and get information, and they can call skills to complete complex tasks.
  """
  type: str = Field(default="agent", description="Node type, fixed to 'activity' for activity nodes", frozen=True)