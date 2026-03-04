/*
  Warnings:

  - You are about to drop the `AgentAction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AgentTool` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `McpServer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tool` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_docsize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_idx` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AgentAction";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AgentTool";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "McpServer";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Tool";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "memory_fts";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "memory_fts_config";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "memory_fts_data";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "memory_fts_docsize";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "memory_fts_idx";
PRAGMA foreign_keys=on;
