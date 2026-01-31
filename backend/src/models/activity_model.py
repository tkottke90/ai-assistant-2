from typing import Optional
from datetime import datetime
from pydantic import Field
from enum import Enum
from .base_model import BaseTable

class ActivityStatus(str, Enum):
  PENDING = "PENDING"
  IN_PROGRESS = "IN_PROGRESS"
  COMPLETED = "COMPLETED"
  FAILED = "FAILED"
  PENDING_APPROVAL = "PENDING_APPROVAL"
  DENIED = "DENIED"
  CANCELLED = "CANCELLED"
  MISSED = "MISSED"

class ActivityTable(BaseTable):
  id: int = Field(..., description="Primary key for the activity in the database")

  # Tracks unstructured metadata about the activity
  metadata: dict = Field(
    default_factory=dict,
    description="Additional metadata related to the activity"
  )

  status: ActivityStatus = Field(
    default=ActivityStatus.PENDING,
    description="Current status of the activity"
  )

  # User and AI interaction fields
  user_input: Optional[str] = Field(description="The input provided by the user that triggered this activity")
  ai_response: Optional[str] = Field(description="The AI-generated response for this activity, if applicable")

  # Automation fields
  automation_id: Optional[int] = Field(description="Foreign key to the associated automation")
  automation_version: Optional[int] = Field(description="Version of the associated automation at the time of activity creation")

  approval_action: Optional[dict] = Field(
    description="Details of the approval action taken, if applicable"
  )
  approval_action_hash: Optional[str] = Field(
    description="Hash of the approval action for integrity verification"
  )

  approval_decision: Optional[str] = Field(
    description="Decision made during the approval process (e.g., approved, denied)"
  )

  approval_decided_at: Optional[datetime] = Field(
    default=None,
    description="Timestamp when the approval decision was made"
  )

  approved_by: Optional[str] = Field(
    description="Who approved or denied the activity"
  )

  cancelled_at: Optional[datetime] = Field(default=None, description="Timestamp when the activity was cancelled")
  cancelled_by: Optional[str] = Field(description="Who cancelled the activity")
  cancellation_reason: Optional[str] = Field(description="Reason for cancelling the activity")

  class Config:
      """Pydantic configuration for JSON schema generation and validation."""
      json_schema_extra = {
          "example": {
              "id": 1,
              "status": "IN_PROGRESS",
              "user_input": "Can you check my email for new messages?",
              "ai_response": "Found 5 new emails",
              "metadata": { },
              "created_at": "2026-01-31T12:00:00Z",
              "updated_at": "2026-01-31T12:05:00Z"
          }
      }