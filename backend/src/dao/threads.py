from ..database import get_database

def get_threads():
    """
    Get list of chat threads
    """
    db = get_database()
    

    cursor = db.cursor()
    cursor.execute("""
    SELECT DISTINCT thread_id FROM checkpoints
    """)

    # Fetch all results and extract thread_id from tuples
    rows = cursor.fetchall()
    cursor.close()
    
    # Return list of thread_ids (rows are tuples like [('thread1',), ('thread2',)])
    return [row[0] for row in rows]

def get_thread_messages(thread_id: str):
    """
    Get list of chat threads
    """
    db = get_database()
    

    cursor = db.cursor()
    cursor.execute("""
    SELECT thread_id, checkpoint_id, checkpoint, metadata FROM checkpoints
    WHERE thread_id = ?
    """,
    (thread_id,)
    )

    # Fetch all results and extract thread_id from tuples
    rows = cursor.fetchall()
    cursor.close()
    
    # Return list of thread_ids (rows are tuples like [('thread1',), ('thread2',)])
    return rows

