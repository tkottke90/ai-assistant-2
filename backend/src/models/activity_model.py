from .base_model import BaseTable
from datetime import datetime, timezone
from enum import Enum
from langchain_core.messages import HumanMessage, AIMessage
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import json
from ..utils import formatting
from .graph import BaseNode, Node

migrations = [
  # Add index for thread_id since all activities will have one
  """
  CREATE INDEX IF NOT EXISTS idx_activity_thread_id 
  ON node(json_extract(properties, '$.thread_id'))
  WHERE type = 'activity';
  """,
  # Add index for automation_id for activities that are part of automations
  """
  CREATE INDEX IF NOT EXISTS idx_activity_automation_id 
  ON node(json_extract(properties, '$.automation_id'))
  WHERE type = 'activity' AND json_extract(properties, '$.automation_id') IS NOT NULL;
  """,
  ## Allows us to search for activities pending approval
  """
  CREATE INDEX IF NOT EXISTS idx_activity_automation_id 
  ON node(json_extract(properties, '$.automation_action'))
  WHERE type = 'activity' AND json_extract(properties, '$.automation_action') IS NULL;
  """,
  # Add index for canceled activities to speed up search/cleanup of cancelled activities
  """
  CREATE INDEX IF NOT EXISTS idx_activity_canceled_at 
  ON node(json_extract(properties, '$.cancelled_at'))
  WHERE type = 'activity' AND json_extract(properties, '$.cancelled_at') IS NOT NULL;
  """,
  # Add FTS table for chat activities
  """
  CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
      node_id UNINDEXED,
      user_input,
      ai_response,
      content='node',
      content_rowid='node_id'
  );
  """,
  # Trigger to populate FTS on insert
  """
  CREATE TRIGGER IF NOT EXISTS chat_fts_insert
  AFTER INSERT ON activities
  WHERE NEW.type = 'activity'
  AND json_extract(NEW.properties, '$.user_input') IS NOT NULL
  BEGIN
      INSERT INTO chat_fts(rowid, id, user_input, ai_response)
      VALUES (NEW.id, NEW.id, NEW.user_input, NEW.ai_response);
  END;
  """,
  # Trigger to update FTS on update
  """
  CREATE TRIGGER IF NOT EXISTS chat_fts_update
  AFTER UPDATE ON activities
  WHERE NEW.type = 'activity'
  AND json_extract(NEW.properties, '$.user_input') IS NOT NULL
  BEGIN
      UPDATE chat_fts
      SET user_input = NEW.user_input,
          ai_response = NEW.ai_response
      WHERE rowid = NEW.id;
  END;
  """,
  # Trigger to delete FTS entry on delete
  """
  CREATE TRIGGER IF NOT EXISTS chat_fts_delete
  AFTER DELETE ON node
  WHERE OLD.type = 'activity'
  AND json_extract(OLD.properties, '$.user_input') IS NOT NULL
  BEGIN
      DELETE FROM chat_fts WHERE rowid = OLD.id;
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



class CommonActivityProperties(BaseModel):
  thread_id: int = Field(..., description="ID of the thread this activity belongs to")
  metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata for the activity. Not formatted by the system and mainly used for reporting and debugging purposes.")

class CommonActivitiesNode(BaseNode):
  node_id: Optional[int] = Field(default=None, description="Primary key, set by database on insert")
  type: str = Field(default="activity", description="Node type, fixed to 'activity' for activity nodes", frozen=True)
  properties: dict = Field(default_factory=dict, description="Serialized properties of the activity, stored as JSON in the database")
  created_at: Optional[datetime] = Field(default=None)

  def to_chat_messages(self):
    """Convert activity to a list of chat messages."""
    messages = []

    # Ensure datetime is UTC-aware and format with 'Z' suffix
    utc_timestamp = self.created_at.replace(tzinfo=timezone.utc).isoformat()

    user_input = self.properties.get("user_input", False)
    if user_input:
      messages.append(HumanMessage(
        content=user_input,
        id=f"activity-{self.node_id}-human",
        additional_kwargs={ "timestamp": utc_timestamp, "html": formatting.format_chat_message(user_input) }
      ))
    
    ai_response = self.properties.get("ai_response", False)
    if ai_response:      
      messages.append(AIMessage(
          content=ai_response,
          id=f"activity-{self.node_id}-ai",
          additional_kwargs={ 
            "metadata": self.properties.get("metadata", {}).get("llm", {}), 
            "timestamp": utc_timestamp,
            "html": formatting.format_chat_message(ai_response)
          }))
      
    # Future - Can show other types of messages based on activity type
    #  - Tool Calls
    #  - Approval Requests
    #  - Approval Decisions
  
    return messages


# === Automation Activity ===

class AutomationProperties(CommonActivityProperties):
  """Definition for the properties of an automation activity node."""
  automation_id: int = Field(..., description="ID of the automation being executed")
  automation_version: int = Field(..., description="Version of the automation being executed")
  status: ActivityStatus = Field(description="Current status of the activity", default=ActivityStatus.PENDING)
  approval_action: Optional[str] = Field(default=None, description="Action required for approval (e.g. 'approve', 'deny')")
  approval_action_hash: Optional[str] = Field(default=None, description="Hash of the action for idempotency")
  approval_decision: Optional[str] = Field(default=None, description="Decision made on the approval action (e.g. 'approved', 'denied')")
  approval_decided_at: Optional[datetime] = Field(default=None, description="Timestamp when the approval decision was made")
  approved_by: Optional[str] = Field(default=None, description="User who made the approval decision")
  cancelled_at: Optional[datetime] = Field(default=None, description="Timestamp when the activity was cancelled")
  cancelled_by: Optional[str] = Field(default=None, description="User who cancelled the activity")
  cancellation_reason: Optional[str] = Field(default=None, description="Reason for cancellation")

class AutomationActivity(CommonActivitiesNode, Node[AutomationProperties]):
  """Specialized activity for automation executions, with helper methods for message formatting."""
  
  @classmethod
  def from_db_row(cls, row: dict) -> "AutomationActivity":
    """Create instance from database row with automatic property deserialization."""
    return cls.model_validate(row)
  
  def complete(self, success: bool, metadata: Optional[dict] = None):
    """Set the activity status to COMPLETED or FAILED based on success parameter and update the timestamp."""    
    self.properties.status = ActivityStatus.COMPLETED if success else ActivityStatus.FAILED
    if metadata:
      self.properties.metadata.update(metadata)

    self.updated_at = datetime.now(timezone.utc)

  def start(self):
    """Set the activity status to IN_PROGRESS and update the timestamp."""
    self.properties.status = ActivityStatus.IN_PROGRESS
    self.updated_at = datetime.now(timezone.utc)

# === Chat Activity ===

class ChatProperties(CommonActivityProperties):
  """Definition for the properties of a chat activity node."""
  user_input: Optional[str] = Field(default=None, description="User input message content")
  ai_response: Optional[str] = Field(default=None, description="AI response message content")

class ChatActivity(CommonActivitiesNode, Node[ChatProperties]):
  """Specialized activity for chat interactions, with helper methods for message formatting."""
  
  @classmethod
  def from_db_row(cls, row: dict) -> "ChatActivity":
    """Create instance from database row with automatic property deserialization."""
    return cls.model_validate(row)

  @staticmethod
  def create_search_messages_query(query: str, thread_id: Optional[int], limit: int = 10) -> tuple[str, list[str]]:
    """Searches user_input and ai_response for the input string, optionally filtered by thread_id."""
    # This is a placeholder implementation. The actual search will be done via the chat_fts virtual table in the database.
    
    baseQuery = """
    SELECT
      n.node_id,
      json_extract(n.properties, '$.user_input') AS user_input,
      json_extract(n.properties, '$.ai_response') AS ai_response
      json_extract(n.properties, '$.thread_id') AS thread_id,
      activity_fts.rank AS relevance_score
    FROM chat_fts
    JOIN node n ON chat_fts.rowid = n.node_id
    WHERE chat_fts MATCH ?
    """

    if thread_id is not None:
      baseQuery += " AND json_extract(n.properties, '$.thread_id') = ?"
    
    baseQuery += " ORDER BY relevance_score LIMIT ?"
    
    
    return baseQuery, [query, thread_id, limit] if thread_id is not None else [query, limit]
  
