


from datetime import datetime
import json
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field, field_serializer, field_validator


migrations = [
  """
  CREATE TABLE IF NOT EXISTS node
  (
    node_id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    properties TEXT NOT NULL CHECK(json_valid(properties)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  """,
  """
  CREATE TABLE IF NOT EXISTS edge
  (
    edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_node_id INTEGER NOT NULL,
    target_node_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    properties TEXT NOT NULL CHECK(json_valid(properties)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (source_node_id) REFERENCES node(node_id),
    FOREIGN KEY (target_node_id) REFERENCES node(node_id)
  );
  """,
  # Trigger to cleanup edges when a node is deleted
  """
  CREATE TRIGGER IF NOT EXISTS node_delete_cleanup
  AFTER DELETE ON node
  BEGIN
    DELETE FROM edge WHERE source_node_id = OLD.node_id OR target_node_id = OLD.node_id;
  END;
  """,
  # Create index on type
  """
  CREATE INDEX IF NOT EXISTS idx_activity_status 
  ON node(type);
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_node_updated
  ON node(updated_at DESC);
  """
]

T = TypeVar('T', bound=BaseModel)

class BaseNode(BaseModel):
  node_id: Optional[int] = Field(default=None, description="Primary key for the node in the database.  Created by the database or empty for new records")
  
  type: str = Field(..., description="Type of the node")

  created_at: Optional[datetime] = Field(default=None)
  updated_at: Optional[datetime] = Field(default=None)

class Node(BaseNode, Generic[T]):
  node_id: Optional[int] = Field(default=None, description="Primary key for the node in the database.  Created by the database or empty for new records")
  
  type: str = Field(..., description="Type of the node")
  
  properties: str = Field(..., description="JSON string of the node properties")

  created_at: Optional[datetime] = Field(default=None)
  updated_at: Optional[datetime] = Field(default=None)
  
  @field_validator('properties', mode='before')
  @classmethod
  def parse_properties(cls, v):
      """Convert JSON string from DB back to typed model."""
      if isinstance(v, str):
          try:
              return json.loads(v)
          except json.JSONDecodeError:
              print(f"Failed to decode properties JSON: {v}")
              return {}
      return v
  
  @field_serializer('*')
  def serialize_datetime_fields(self, value, field):
      """
      Convert datetime to ISO 8601 string for fields ending in '_at'.
      Preserves other field types unchanged.
      """
      # Only serialize datetime objects from timestamp fields
      if field.field_name.endswith('_at') and isinstance(value, datetime):
          return value.isoformat()
      return value

  def to_db_dict(self) -> dict:
      """Convert to dictionary for database insertion with JSON-serialized properties."""
      return {
          "node_id": self.node_id,
          "type": self.type,
          "properties": self.properties.model_dump_json() if isinstance(self.properties, BaseModel) else json.dumps(self.properties),
          "created_at": self.created_at,
          "updated_at": self.updated_at
      }
  
  def create_record(self) -> tuple[str, str]:
      """Create a tuple of values for database insertion."""
      return (
          self.type,
          self.properties.model_dump_json() if isinstance(self.properties, BaseModel) else json.dumps(self.properties),
      )

  @classmethod
  def from_db_row(cls, row: dict) -> "Node":
      """Create instance from database row with automatic typing."""
      return cls.model_validate(row)

  class Config:
      json_encoders = {
          datetime: lambda v: v.isoformat() if v else None
      }