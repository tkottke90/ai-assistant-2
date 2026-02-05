import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from ..config.manager import ConfigManager
from ..config.models.database import DatabaseConfig
from ..logging import get_logger
from . import migrations
import os
from functools import wraps
from typing import Callable, ParamSpec, TypeVar

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
    __sqlite_db__.row_factory = sqlite3.Row

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

def get_cursor() -> sqlite3.Cursor:
    """
    Get a new cursor for the database connection.
    """
    db = get_database()

    return db.cursor()

# Type variables for preserving function signatures
P = ParamSpec('P')
T = TypeVar('T')

def transaction(func: Callable[P, T]) -> Callable[P, T]:
    """
    Decorator that wraps a function in a database transaction.
    Automatically commits on success or rolls back on exception.
    
    Usage:
        @transaction
        def create_user(name: str) -> int:
            db = get_database()
            db.execute("INSERT INTO users (name) VALUES (?)", (name,))
            return cursor.lastrowid
    """
    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        db = get_database()
        
        # Check if already in a transaction (nested transaction support)
        in_transaction = db.in_transaction
        
        try:
            if not in_transaction:
                db.execute("BEGIN")
            
            result = func(*args, **kwargs)
            
            if not in_transaction:
                db.commit()
            
            return result
            
        except Exception as e:
            if not in_transaction:
                db.rollback()
            raise  # Re-raise the exception after rollback
    
    return wrapper