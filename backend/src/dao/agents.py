from ..models.agent_model import AgentNodeProperties, Agent
from ..database import get_cursor, transaction

@transaction
def get_agent_by_name(name: str) -> Agent | None:
  """
  Get an Agent by name
  """
  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM node
    WHERE type = 'agent'
    AND json_extract(properties, '$.name') = ?
  """, (name,))

  record = cursor.fetchone()

  if not record:
    return None

  return Agent(**dict(record))

@transaction
def create_agent(props: AgentNodeProperties) -> Agent:
  """
  Create an Agent in the database
  """
  # Check for duplicate name
  existing = get_agent_by_name(props.name)
  if existing:
    raise ValueError(f"Agent with name '{props.name}' already exists")
  
  cursor = get_cursor()

  agent = Agent(properties=props)

  cursor.execute("""
    INSERT INTO node (type, properties)
    VALUES (?, ?)
    RETURNING *
  """, agent.create_record())

  record = cursor.fetchone()

  return Agent(**dict(record))

@transaction
def list_agents() -> list[Agent]:
  """
  List all Agents in the database
  """
  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM agent_view
    WHERE type = 'agent'
    ORDER BY created_at DESC
  """)

  rows = cursor.fetchall()

  return [Agent(**dict(row)) for row in rows]

@transaction
def list_agents_paginated(limit: int, offset: int) -> tuple[list[Agent], int]:
  """
  List Agents with pagination
  Returns tuple of (agents_list, total_count)
  """
  cursor = get_cursor()

  # Get total count
  cursor.execute("""
    SELECT COUNT(*) as count FROM node
    WHERE type = 'agent'
  """)
  
  total = cursor.fetchone()['count']

  # Get paginated results
  cursor.execute("""
    SELECT * FROM agent_view
    WHERE type = 'agent'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  """, (limit, offset))

  rows = cursor.fetchall()

  return [Agent(**dict(row)) for row in rows], total

@transaction
def get_agent(agent_id: str) -> Agent:
  """
  Get an Agent by ID
  """
  cursor = get_cursor()

  cursor.execute("""
    SELECT * FROM node
    WHERE type = 'agent'
    AND id = ?
  """, (agent_id,))

  record = cursor.fetchone()

  if not record:
    raise ValueError(f"Agent with id '{agent_id}' not found")

  return Agent(**dict(record))

@transaction
def delete_agent(agent_id: str) -> bool:
  """
  Delete an Agent by ID
  """
  cursor = get_cursor()

  cursor.execute("""
    DELETE FROM node
    WHERE type = 'agent'
    AND id = ?
  """, (agent_id,))

  return cursor.rowcount > 0

@transaction
def update_agent(agent_id: str, props: AgentNodeProperties) -> Agent:
  """
  Update an Agent by ID
  """
  cursor = get_cursor()

  # Check if agent exists
  cursor.execute("""
    SELECT * FROM node
    WHERE type = 'agent'
    AND id = ?
  """, (agent_id,))
  
  if not cursor.fetchone():
    raise ValueError(f"Agent with id '{agent_id}' not found")

  # Check for duplicate name (excluding current agent)
  existing = get_agent_by_name(props.name)
  if existing and str(existing.id) != str(agent_id):
    raise ValueError(f"Agent with name '{props.name}' already exists")

  agent = Agent(properties=props, id=agent_id)

  cursor.execute("""
    UPDATE node
    SET properties = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE type = 'agent'
    AND id = ?
    RETURNING *
  """, (agent.properties_json(), agent_id))

  record = cursor.fetchone()

  return Agent(**dict(record))