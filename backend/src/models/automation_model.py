from .base_model import BaseTable
from typing import Optional
from datetime import datetime
from pydantic import Field

class Automation(BaseTable):
    id: int = Field(..., description="Primary key for the automation in the database")

    name: str = Field(..., description="Name of the automation")
    description: str = Field(..., description="Detailed description of the automation")
    instruction: str = Field(..., description="Instructions for the automation's behavior")
    version: int = Field(..., description="Version number of the automation")
    llm_provider: str = Field(..., description="LLM provider used for this automation")
    llm_model: str = Field(..., description="LLM model used for this automation")
    
    active: bool = Field(default=False, description="Indicates if the automation is active")
    
    max_execution_time_seconds: Optional[int] = Field(
        default=300,
        description="Maximum allowed execution time for the automation in seconds"
    )

    replaced_by_id: Optional[int] = Field(
        default=None,
        description="Foreign key to the automation that replaced this version, if any"
    )

    replaced_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when this automation version was replaced by a newer version"
    )