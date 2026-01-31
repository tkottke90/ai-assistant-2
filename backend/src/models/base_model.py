from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_serializer

class BaseTable(BaseModel):
  id: int = Field(..., description="Primary key for the table in the database")

  created_at: Optional[datetime] = Field(default=None, description="Timestamp when the record was created")
  updated_at: Optional[datetime] = Field(default=None, description="Timestamp when the record was last updated")

  class Config:
      # Allow deprecated fields during migration
      extra = "allow"
      
      # Re-validate on assignment (catch config corruption)
      validate_assignment = True

      json_encoders = {
          datetime: lambda v: v.isoformat() if v else None
      }

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