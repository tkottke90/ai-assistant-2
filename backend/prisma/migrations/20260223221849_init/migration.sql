-- CreateTable
CREATE TABLE "Node" (
    "node_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Edge" (
    "node_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Edge_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "Node" ("node_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Edge_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "Node" ("node_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "asset_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "node_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "name" TEXT,
    "description" TEXT,
    "nsfw" BOOLEAN,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "Node" ("node_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Node_type_idx" ON "Node"("type");

-- CreateIndex
CREATE INDEX "Node_created_at_idx" ON "Node"("created_at");

-- CreateIndex
CREATE INDEX "Node_updated_at_idx" ON "Node"("updated_at");

-- CreateIndex
CREATE INDEX "Edge_type_idx" ON "Edge"("type");

-- CreateIndex
CREATE INDEX "Edge_source_id_idx" ON "Edge"("source_id");

-- CreateIndex
CREATE INDEX "Edge_target_id_idx" ON "Edge"("target_id");

-- CreateIndex
CREATE INDEX "Edge_created_at_idx" ON "Edge"("created_at");

-- CreateIndex
CREATE INDEX "Edge_updated_at_idx" ON "Edge"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "Edge_source_id_target_id_type_key" ON "Edge"("source_id", "target_id", "type");

-- CreateIndex
CREATE INDEX "Asset_node_id_idx" ON "Asset"("node_id");

-- CreateIndex
CREATE INDEX "Asset_created_at_idx" ON "Asset"("created_at");

-- CreateIndex
CREATE INDEX "Asset_updated_at_idx" ON "Asset"("updated_at");
