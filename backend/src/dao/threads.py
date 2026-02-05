import json
from ..database import get_database, get_checkpointer

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
    checkpointer = get_checkpointer()

    checkpoints = checkpointer.list({
        "configurable": {
            "thread_id": thread_id
        }
    })

    if not checkpoints:
        print("No checkpoints found for thread %s", thread_id)
        return []
    
    try:
        messageList = []

        print('loading checkpoints for thread %s', thread_id)
        for message in checkpoints:
            checkpoint_messages = message.checkpoint.get("channel_values", {}).get("messages", [])
            
            print ("Checkpoint messages for thread %s: %s", thread_id, checkpoint_messages)

            messageList.clear()
            messageList.extend(checkpoint_messages)

        return messageList
    except Exception as e:
        print("Error retrieving messages for thread %s: %s", thread_id, e)
        return []

