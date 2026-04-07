/*
  - The primary key for the `Edge` table will be changed.
  - Rename column `node_id` to `edge_id` on the `Edge` table.
  - Add JSON index on Node.properties for threadId lookups.
*/

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Edge" (
    "edge_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Edge_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "Node" ("node_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Edge_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "Node" ("node_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Edge" ("created_at", "properties", "source_id", "target_id", "type", "updated_at") SELECT "created_at", "properties", "source_id", "target_id", "type", "updated_at" FROM "Edge";
DROP TABLE "Edge";
ALTER TABLE "new_Edge" RENAME TO "Edge";
CREATE INDEX "Edge_type_idx" ON "Edge"("type");
CREATE INDEX "Edge_source_id_idx" ON "Edge"("source_id");
CREATE INDEX "Edge_target_id_idx" ON "Edge"("target_id");
CREATE INDEX "Edge_created_at_idx" ON "Edge"("created_at");
CREATE INDEX "Edge_updated_at_idx" ON "Edge"("updated_at");
CREATE UNIQUE INDEX "Edge_source_id_target_id_type_key" ON "Edge"("source_id", "target_id", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- JSON index for fast threadId lookups on Node.properties
CREATE INDEX "idx_node_thread_id" ON "Node"(json_extract("properties", '$.threadId'));
