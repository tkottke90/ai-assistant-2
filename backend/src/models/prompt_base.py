from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class PromptSectionType(str, Enum):
  MARKDOWN = "markdown"
  PLAINTEXT = "plaintext"
  XML = "xml"

class PromptSection(BaseModel):
  name: str = Field(..., description="Name of the prompt section, e.g. 'Behavior Instructions'")
  type: PromptSectionType = Field(default=PromptSectionType.PLAINTEXT, description="Type of the prompt section content, e.g. 'markdown'")
  content: str = Field(..., description="Content of the prompt section, e.g. 'You are a helpful assistant that provides concise answers to user questions.'")

class PromptNodeProperties(BaseModel):
  prompt_template: str = Field(..., description="The prompt template with placeholders for variables, e.g. 'What is the capital of {country}?'")
  variables: Dict[str, Any] = Field(default_factory=dict, description="Key-value pairs for variables used in the prompt template")
  version: float = Field(..., description="Version number for the prompt template, used for tracking changes and ensuring compatibility")
  sections: Optional[list[PromptSection]] = Field(default_factory=list, description="List of additional prompt sections that provide context and instructions for the LLM. Each section has a name, type, and content.")


