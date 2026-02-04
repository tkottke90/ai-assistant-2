from typing import Optional
from pydantic import BaseModel, Field

migrations = [
  """
  CREATE TABLE IF NOT EXISTS thread_summaries
  (
      thread_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_thread_summaries_updated 
  ON thread_summaries(updatedAt DESC);
  """,
  # Add FTS table for summaries
  """
  CREATE VIRTUAL TABLE IF NOT EXISTS thread_summaries_fts USING fts5(
      thread_id UNINDEXED,
      summary,
      content='thread_summaries',
      content_rowid='rowid'
  );
  """,
  # Trigger to populate FTS on insert
  """
  CREATE TRIGGER IF NOT EXISTS thread_summaries_fts_insert
  AFTER INSERT ON thread_summaries
  BEGIN
      INSERT INTO thread_summaries_fts(rowid, thread_id, summary)
      VALUES (NEW.rowid, NEW.thread_id, NEW.summary);
  END;
  """,
  # Trigger to update FTS on update
  """
  CREATE TRIGGER IF NOT EXISTS thread_summaries_fts_update
  AFTER UPDATE ON thread_summaries
  BEGIN
      UPDATE thread_summaries_fts
      SET summary = NEW.summary
      WHERE rowid = NEW.rowid;
  END;
  """,
  # Trigger to delete FTS entry on delete
  """
  CREATE TRIGGER IF NOT EXISTS thread_summaries_fts_delete
  AFTER DELETE ON thread_summaries
  BEGIN
      DELETE FROM thread_summaries_fts WHERE rowid = OLD.rowid;
  END;
  """
]

class ThreadSummary(BaseModel):

  thread_id: str = Field(..., description="ID of the thread")
  summary: str = Field(..., description="Summary of the thread")
  createdAt: Optional[str] = Field(default=None, description="Creation timestamp")
  updatedAt: Optional[str] = Field(default=None, description="Last update timestamp")