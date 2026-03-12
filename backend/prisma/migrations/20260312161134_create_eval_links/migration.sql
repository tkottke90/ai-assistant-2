/*
  Warnings:

  - You are about to drop the `memory_fts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_docsize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_idx` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `tool_name` to the `EvaluationTool` table without a default value. This is not possible if the table is not empty.

*/

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvaluationResults" (
    "evaluation_result_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "evaluation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "results" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "EvaluationResults_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "Evaluation" ("evaluation_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EvaluationResults" ("completed_at", "created_at", "evaluation_id", "evaluation_result_id", "results", "status", "updated_at") SELECT "completed_at", "created_at", "evaluation_id", "evaluation_result_id", "results", "status", "updated_at" FROM "EvaluationResults";
DROP TABLE "EvaluationResults";
ALTER TABLE "new_EvaluationResults" RENAME TO "EvaluationResults";
CREATE TABLE "new_EvaluationTool" (
    "evaluation_tool_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "evaluation_id" INTEGER NOT NULL,
    "tool_id" INTEGER NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationTool_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "Evaluation" ("evaluation_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvaluationTool_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "Tool" ("tool_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EvaluationTool" ("created_at", "evaluation_id", "evaluation_tool_id", "tier", "tool_id", "updated_at") SELECT "created_at", "evaluation_id", "evaluation_tool_id", "tier", "tool_id", "updated_at" FROM "EvaluationTool";
DROP TABLE "EvaluationTool";
ALTER TABLE "new_EvaluationTool" RENAME TO "EvaluationTool";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
