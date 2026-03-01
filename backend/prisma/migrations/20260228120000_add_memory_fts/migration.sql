-- CreateVirtualTable: FTS5 contentless table for memory node full-text search
-- This table indexes memory nodes (Node rows where type LIKE 'memory:%')
-- and is kept in sync via triggers on the Node table.
--
-- node_id and agent_id are UNINDEXED (stored for filtering/joins, not searchable)
-- type and content are indexed for full-text search
-- content='' makes this contentless (no data duplication)
-- contentless_delete=1 enables DELETE support (requires SQLite >= 3.43.0)

CREATE VIRTUAL TABLE memory_fts USING fts5(
  node_id UNINDEXED,
  agent_id UNINDEXED,
  type,
  content,
  content='',
  contentless_delete=1
);

-- Trigger: Sync FTS on memory node INSERT
-- Only fires when the new row's type starts with 'memory:'
CREATE TRIGGER memory_fts_insert AFTER INSERT ON Node
WHEN NEW.type LIKE 'memory:%'
BEGIN
  INSERT INTO memory_fts (rowid, node_id, agent_id, type, content)
  VALUES (
    NEW.node_id,
    NEW.node_id,
    json_extract(NEW.properties, '$.agent_id'),
    NEW.type,
    json_extract(NEW.properties, '$.content')
  );
END;

-- Trigger: Sync FTS on memory node UPDATE
-- Deletes the old entry and re-inserts with updated values
CREATE TRIGGER memory_fts_update AFTER UPDATE ON Node
WHEN NEW.type LIKE 'memory:%'
BEGIN
  DELETE FROM memory_fts WHERE rowid = OLD.node_id;
  INSERT INTO memory_fts (rowid, node_id, agent_id, type, content)
  VALUES (
    NEW.node_id,
    NEW.node_id,
    json_extract(NEW.properties, '$.agent_id'),
    NEW.type,
    json_extract(NEW.properties, '$.content')
  );
END;

-- Trigger: Sync FTS on memory node DELETE
-- Removes the FTS entry when a memory node is deleted
CREATE TRIGGER memory_fts_delete AFTER DELETE ON Node
WHEN OLD.type LIKE 'memory:%'
BEGIN
  DELETE FROM memory_fts WHERE rowid = OLD.node_id;
END;
