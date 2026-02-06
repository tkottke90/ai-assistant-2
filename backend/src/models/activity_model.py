from .base_model import BaseTable
from datetime import datetime
from enum import Enum
from langchain_core.messages import HumanMessage, AIMessage
from pydantic import Field, field_validator
from typing import ClassVar, Optional
import json

migrations = [
  """
  CREATE TABLE IF NOT EXISTS activities
  (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT,
      metadata TEXT DEFAULT '{}',
      status TEXT DEFAULT 'PENDING',
      user_input TEXT,
      ai_response TEXT,
      automation_id INTEGER,
      automation_version INTEGER,
      approval_action TEXT,
      approval_action_hash TEXT,
      approval_decision TEXT,
      approval_decided_at TIMESTAMP,
      approved_by TEXT,
      cancelled_at TIMESTAMP,
      cancelled_by TEXT,
      cancellation_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES checkpoints(thread_id)
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_activities_updated 
  ON activities(updated_at DESC);
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_activities_automation_id 
  ON activities(automation_id);
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_activities_automation_id_version 
  ON activities(automation_id, automation_version);
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_activities_approval_decided_at 
  ON activities(approval_decided_at DESC);
  """,
  # Add FTS table for activities
  """
  CREATE VIRTUAL TABLE IF NOT EXISTS activities_fts USING fts5(
      id UNINDEXED,
      user_input,
      ai_response,
      content='activities',
      content_rowid='id'
  );
  """,
  # Trigger to populate FTS on insert
  """
  CREATE TRIGGER IF NOT EXISTS activities_fts_insert
  AFTER INSERT ON activities
  BEGIN
      INSERT INTO activities_fts(rowid, id, user_input, ai_response)
      VALUES (NEW.id, NEW.id, NEW.user_input, NEW.ai_response);
  END;
  """,
  # Trigger to update FTS on update
  """
  CREATE TRIGGER IF NOT EXISTS activities_fts_update
  AFTER UPDATE ON activities
  BEGIN
      UPDATE activities_fts
      SET user_input = NEW.user_input,
          ai_response = NEW.ai_response
      WHERE rowid = NEW.id;
  END;
  """,
  # Trigger to delete FTS entry on delete
  """
  CREATE TRIGGER IF NOT EXISTS activities_fts_delete
  AFTER DELETE ON activities
  BEGIN
      DELETE FROM activities_fts WHERE rowid = OLD.id;
  END;
  """
]

class ActivityStatus(str, Enum):
  PENDING = "PENDING"
  IN_PROGRESS = "IN_PROGRESS"
  COMPLETED = "COMPLETED"
  FAILED = "FAILED"
  PENDING_APPROVAL = "PENDING_APPROVAL"
  DENIED = "DENIED"
  CANCELLED = "CANCELLED"
  MISSED = "MISSED"

class Activity(BaseTable):
  id: int = Field(..., description="Primary key for the activity in the database")

  thread_id: Optional[str] = Field(
    description="ID of the chat thread associated with this activity, if applicable"
  )

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

  @field_validator('metadata', mode='before')
  @classmethod
  def parse_metadata(cls, v):
    """Convert JSON string from DB back to dict."""
    if isinstance(v, str):
      try:
        return json.loads(v)
      except json.JSONDecodeError:
        return {}
    return v if v is not None else {}
  
  def to_chat_messages(self):
    """Convert activity to a list of chat messages."""
    messages = []

    if self.user_input:
      messages.append(HumanMessage(
        content=self.user_input,
        id=f"activity-{self.id}-human",
        additional_kwargs={ "timestamp": self.created_at.isoformat() }
      ))
    
    if self.ai_response:
      messages.append(AIMessage(
          content=self.ai_response,
          id=f"activity-{self.id}-ai",
          additional_kwargs={ 
             "metadata": self.metadata.get("llm", {}), 
             "timestamp": self.created_at.isoformat()
          }))
      
    # Future - Can show other types of messages based on activity type
    #  - Tool Calls
    #  - Approval Requests
    #  - Approval Decisions
  
    return messages

  Status: ClassVar = ActivityStatus

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

