import { PrismaClient } from './prisma/client';
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter
});

export const checkpointer = SqliteSaver.fromConnString(process.env.DATABASE_URL);