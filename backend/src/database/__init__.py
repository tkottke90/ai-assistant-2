import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from ..config.manager import ConfigManager
from ..config.models.database import DatabaseConfig
from ..logging import get_logger
from . import migrations
import os

__sqlite_db__: sqlite3.Connection | None = None

def initialize_database(configs: ConfigManager) -> None:
    """
    Initialize the SQLite database and create necessary tables.
    """
    # Capture the global variable
    global __sqlite_db__
    
    logger = get_logger("database")

    # Get database configuration
    db_config: DatabaseConfig = configs.get_config("database")
    sqlite_cfg = configs.normalize_path(db_config.sqlite.path).resolve()

    # Make sure the directory for the database exists
    if sqlite_cfg != ":memory:":
        db_path = os.path.abspath(sqlite_cfg)
        db_dir = os.path.dirname(db_path)
        if not os.path.exists(db_dir):
            logger.debug(f"Creating database directory at {db_dir}")
            os.makedirs(db_dir, exist_ok=True)

    logger.debug(f"Initializing database - connecting to {sqlite_cfg}")

    # Connect to the SQLite database
    __sqlite_db__ = sqlite3.connect(sqlite_cfg, check_same_thread=False)

    # Setup SqliteSaver tables
    logger.debug("Setting up checkpoint tables")
    saver = SqliteSaver(__sqlite_db__)
    saver.setup();

    # Future: Add migrations or other initialization logic here
    logger.debug("Running database migrations")
    migrations.run_migrations(
        sqlite=__sqlite_db__,
        logger=logger
    )


def get_database() -> sqlite3.Connection:
    """
    Get a SqliteSaver instance for interacting with the database.
    """
    global __sqlite_db__
    
    if __sqlite_db__ is None:
        raise RuntimeError("Database not initialized. Call initialize_database() first.")

    return __sqlite_db__

def get_checkpointer() -> SqliteSaver:
    """
    Get a SqliteSaver checkpointer instance.
    """
    global __sqlite_db__
    
    if __sqlite_db__ is None:
        raise RuntimeError("Database not initialized. Call initialize_database() first.")
    
    return SqliteSaver(__sqlite_db__)

