-- CreateTable
CREATE TABLE "McpServer" (
    "server_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "config_id" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Tool" (
    "tool_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mcp_server_id" INTEGER,
    "locked_tier" INTEGER,
    "input_schema" JSONB NOT NULL,
    "output_schema" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tool_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "McpServer" ("server_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentTool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agent_id" INTEGER NOT NULL,
    "tool_id" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTool_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent" ("agent_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentTool_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "Tool" ("tool_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "action_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id" TEXT NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_turn_checkpoint_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "action_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "justification" TEXT,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAction_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent" ("agent_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_id_key" ON "AgentAction"("id");

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_config_id_key" ON "McpServer"("config_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_id_key" ON "Tool"("id");

-- CreateIndex
CREATE INDEX "Tool_source_idx" ON "Tool"("source");

-- CreateIndex
CREATE INDEX "Tool_mcp_server_id_idx" ON "Tool"("mcp_server_id");

-- CreateIndex
CREATE INDEX "AgentTool_agent_id_idx" ON "AgentTool"("agent_id");

-- CreateIndex
CREATE INDEX "AgentTool_tool_id_idx" ON "AgentTool"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTool_agent_id_tool_id_key" ON "AgentTool"("agent_id", "tool_id");

-- CreateIndex
CREATE INDEX "AgentAction_user_turn_checkpoint_id_idx" ON "AgentAction"("user_turn_checkpoint_id");

-- CreateIndex
CREATE INDEX "AgentAction_id_idx" ON "AgentAction"("id");

-- CreateIndex
CREATE INDEX "AgentAction_thread_id_idx" ON "AgentAction"("thread_id");

-- CreateIndex
CREATE INDEX "AgentAction_thread_id_agent_id_idx" ON "AgentAction"("thread_id", "agent_id");

-- CreateIndex
CREATE INDEX "AgentAction_status_idx" ON "AgentAction"("status");

-- CreateIndex
CREATE INDEX "AgentAction_expires_at_idx" ON "AgentAction"("expires_at");
