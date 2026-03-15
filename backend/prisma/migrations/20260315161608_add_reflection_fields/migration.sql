/*
  Warnings:

  - You are about to drop the `memory_fts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_docsize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memory_fts_idx` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "EvaluationResults" ADD COLUMN "nextPrompt" TEXT;
ALTER TABLE "EvaluationResults" ADD COLUMN "notes" TEXT;
