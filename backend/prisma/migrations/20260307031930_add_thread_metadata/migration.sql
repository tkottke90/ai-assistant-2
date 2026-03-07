-- CreateTable
CREATE TABLE "ThreadMetadata" (
    "thread_id" TEXT NOT NULL PRIMARY KEY,
    "agent_id" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'chat',
    "title" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreadMetadata_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent" ("agent_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ThreadMetadata_agent_id_idx" ON "ThreadMetadata"("agent_id");

-- CreateIndex
CREATE INDEX "ThreadMetadata_type_idx" ON "ThreadMetadata"("type");

-- CreateIndex
CREATE INDEX "ThreadMetadata_archived_idx" ON "ThreadMetadata"("archived");
