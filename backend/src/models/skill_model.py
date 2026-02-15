from typing import Optional
from pydantic import Field
from .prompt_base import PromptNodeProperties
from .graph import Node

class SkillNodeProperties(PromptNodeProperties):
  name: str = Field(..., description="Name of the agent, e.g. 'WeatherBot'")
  when_to_use: str = Field(..., description="Description of the agent's purpose and capabilities, e.g. 'An agent that provides weather forecasts based on user queries.'")
  instructions: str = Field(..., description="Instructions for how to use the skill, e.g. 'Use this skill when the user asks for weather information. Provide a concise forecast based on the user's query.'")
  tools: Optional[list[str]] = Field(default_factory=list, description="List of tools that the agent can use, e.g. ['weather_api', 'calendar_api']")

class Skill(Node[SkillNodeProperties]):
  """
  A skill is defined as a reusable prompt which describes a pattern for completing a given task.  This skill's instructions are passed as a 
  message to the agent, which then reasons through the instructions and works to complete the task.  The skill can be used across multiple agents, 
  and can be updated independently of any agent that uses it.
  """
  type: str = Field(default="skill", description="Node type, fixed to 'activity' for activity nodes", frozen=True)

  