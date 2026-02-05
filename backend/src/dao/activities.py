import json
from langchain_core.messages import BaseMessage
from ..models.activity_model import Activity
from ..database import get_cursor, transaction

@transaction
def createChatActivity(thread_id: str, messages: list[BaseMessage], metadata: dict):
  """Create a chat activity in the database from a list of messages."""

  cursor = get_cursor()

  cursor.execute("""
    INSERT INTO activities (thread_id, user_input, ai_response, metadata, status)
    VALUES (?, ?, ?, ?, ?)
  """, (
    thread_id,
    messages[0].content if len(messages) > 0 else "",
    messages[1].content if len(messages) > 1 else "",
    json.dumps(metadata),
    Activity.Status.COMPLETED # Completed because they are just chat messages
  ))

  return cursor.fetchone()

def createAutomationActivity(automation_id: str, automation_version: int, user_input: str, ai_response: str):

  pass

@transaction
def getThreadHistory(thread_id: str) -> list[Activity]:
  """Retrieve all activities for a given thread ID."""

  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM activities
    WHERE thread_id = ?
    ORDER BY id ASC
  """, (thread_id,))

  rows = cursor.fetchall()

  return [Activity(**dict(row)) for row in rows]

@transaction
def getChatHistory(thread_id: str) -> list[Activity]:
  """Retrieve chat history for a given thread ID."""

  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM activities
    WHERE thread_id = ?
    AND user_input IS NOT NULL
    ORDER BY id ASC
  """, (thread_id,))

  rows = cursor.fetchall()

  return [Activity(**dict(row)) for row in rows]
