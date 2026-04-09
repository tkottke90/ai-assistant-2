-- AlterTable: add nullable group column to Tool for MCP tool grouping
ALTER TABLE "Tool" ADD COLUMN "group" TEXT;

-- CreateIndex
CREATE INDEX "Tool_group_idx" ON "Tool"("group");
