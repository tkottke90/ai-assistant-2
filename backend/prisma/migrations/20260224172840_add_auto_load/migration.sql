-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "agent_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "system_prompt" TEXT NOT NULL,
    "auto_start" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Agent" ("agent_id", "created_at", "description", "name", "system_prompt", "updated_at", "version") SELECT "agent_id", "created_at", "description", "name", "system_prompt", "updated_at", "version" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE INDEX "Agent_created_at_idx" ON "Agent"("created_at");
CREATE INDEX "Agent_updated_at_idx" ON "Agent"("updated_at");
CREATE UNIQUE INDEX "Agent_name_version_key" ON "Agent"("name", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
