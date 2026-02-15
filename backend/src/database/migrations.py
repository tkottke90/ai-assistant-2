from logging import Logger
import sqlite3
from ..models import (
  ActivityMigrations,
  AgentMigrations,
  GraphMigrations,
)

migrations = [
  *GraphMigrations,
  *ActivityMigrations,
  *AgentMigrations,
]

def run_migrations(sqlite: sqlite3.Connection, logger: Logger):
  """
  Run database migrations
  """
  cursor = sqlite.cursor()

  try:
    for migration in migrations:
      cursor.execute(migration.strip())
    
    sqlite.commit()
  except Exception as e:
    sqlite.rollback()
  finally:
    cursor.close()