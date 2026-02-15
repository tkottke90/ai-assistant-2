import json
from langchain_core.messages import BaseMessage
from ..models.activity_model import ChatActivity
from ..database import get_cursor, transaction

@transaction
def createChatActivity(thread_id: str, messages: list[BaseMessage], metadata: dict):
  """Create a chat activity in the database from a list of messages."""

  activity = ChatActivity(
    properties={
      "user_input": messages[0].content if len(messages) > 0 else "",
      "ai_response": messages[1].content if len(messages) > 1 else "",
      "thread_id": thread_id,
      "metadata": metadata
    }
  )

  cursor = get_cursor()

  cursor.execute("""
    INSERT INTO node (type, properties)
    VALUES (?, ?)
    RETURNING *
  """, activity.create_record())

  record = cursor.fetchone()

  return ChatActivity(**dict(record))

@transaction
def getThreadHistory(thread_id: str) -> list[ChatActivity]:
  """Retrieve all activities for a given thread ID."""

  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM node
    WHERE type = 'activity'
    AND json_extract(properties, '$.thread_id') = ?
    ORDER BY created_at ASC
  """, (thread_id,))

  rows = cursor.fetchall()

  return [ChatActivity(**dict(row)) for row in rows]

@transaction
def getChatHistory(thread_id: str) -> list[ChatActivity]:
  """Retrieve chat history for a given thread ID."""

  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM node
    WHERE type = 'activity'
    AND json_extract(properties, '$.user_input') IS NOT NULL
    ORDER BY created_at ASC
  """, (thread_id,))

  rows = cursor.fetchall()

  return [ChatActivity(**dict(row)) for row in rows]
