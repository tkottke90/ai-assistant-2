from ..database import get_database
from ..models.thread_summaries import ThreadSummary

def get_summary(thread_id: str):
  """
  Upsert thread summary
  """
  db = get_database()
  
  cursor = db.cursor()
  cursor.execute("""
    SELECT * FROM thread_summaries
    WHERE thread_id = ?
    """,
    (thread_id,)
  )

  summaryRecord = ThreadSummary(**cursor.fetchone());

  db.commit()
  cursor.close()

  return summaryRecord

def find_summaries(query: str, limit: int = 10):
  """
  Find thread summaries matching query
  """
  db = get_database()
  
  cursor = db.cursor()
  cursor.execute("""
    SELECT ts.thread_id, ts.summary, ts.createdAt, ts.updatedAt
    FROM thread_summaries ts
    JOIN thread_summaries_fts fts ON ts.rowid = fts.rowid
    WHERE fts.summary MATCH ?
    ORDER BY bm25(fts)
    LIMIT ?
    """,
    (query,limit)
  )

  rows = cursor.fetchall();
  summaries = [ThreadSummary(**row) for row in rows]

  db.commit()
  cursor.close()

  return summaries

def upsert_summary(thread_id: str, summary: str):
  """
  Upsert thread summary
  """
  db = get_database()
  
  cursor = db.cursor()
  cursor.execute(
    """
    INSERT INTO thread_summaries (thread_id, summary, createdAt, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(thread_id) DO UPDATE SET
        summary=excluded.summary,
        updatedAt=CURRENT_TIMESTAMP;
    """,
    (thread_id, summary)
  )

  summaryRecord = ThreadSummary(cursor.fetchone());

  db.commit()
  cursor.close()

  return summaryRecord
