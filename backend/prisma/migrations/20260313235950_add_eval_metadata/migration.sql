/*
  Warnings:

  - You are about to drop the `memory_fts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_docsize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_idx` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `llm_config` to the `EvaluationResults` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prompt` to the `EvaluationResults` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tools` to the `EvaluationResults` table without a default value. This is not possible if the table is not empty.

*/

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvaluationResults" (
    "evaluation_result_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "evaluation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "prompt" TEXT NOT NULL,
    "llm_config" JSONB NOT NULL,
    "tools" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "EvaluationResults_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "Evaluation" ("evaluation_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EvaluationResults" ("completed_at", "created_at", "evaluation_id", "evaluation_result_id", "results", "status", "updated_at") SELECT "completed_at", "created_at", "evaluation_id", "evaluation_result_id", "results", "status", "updated_at" FROM "EvaluationResults";
DROP TABLE "EvaluationResults";
ALTER TABLE "new_EvaluationResults" RENAME TO "EvaluationResults";
CREATE INDEX "EvaluationResults_evaluation_id_idx" ON "EvaluationResults"("evaluation_id");
CREATE INDEX "EvaluationResults_status_idx" ON "EvaluationResults"("status");
CREATE INDEX "EvaluationResults_created_at_idx" ON "EvaluationResults"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
