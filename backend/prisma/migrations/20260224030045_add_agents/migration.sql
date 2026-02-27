-- CreateTable
CREATE TABLE "Agent" (
    "agent_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "system_prompt" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Agent_created_at_idx" ON "Agent"("created_at");

-- CreateIndex
CREATE INDEX "Agent_updated_at_idx" ON "Agent"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_version_key" ON "Agent"("name", "version");
