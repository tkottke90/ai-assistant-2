from ..models.agent_model import AgentNodeProperties, Agent
from ..database import get_cursor, transaction

@transaction
def create_agent(props: AgentNodeProperties) -> Agent:
  """
  Create an Agent in the database
  """
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
    raise Exception("Agent not found")

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

  if not record:
    raise Exception("Agent not found")

  return Agent(**dict(record))