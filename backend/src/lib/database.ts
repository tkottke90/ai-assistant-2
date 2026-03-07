import { PrismaClient } from './prisma/client';
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import path from 'node:path';

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const dbUrl = path.resolve(process.env.DATABASE_URL.split(':')[1]);

const adapter = new PrismaBetterSqlite3({ url: dbUrl });

export const prisma = new PrismaClient({
  adapter
});

export const checkpointer = SqliteSaver.fromConnString(dbUrl);

/**
 * Lightweight DB liveness probe — used by DbHealthMonitor.
 * Returns true if Prisma can reach the SQLite file, false otherwise.
 */
export async function checkDbHealth(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}