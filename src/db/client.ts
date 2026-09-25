import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let dbSingleton: Db | undefined;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return url;
}

export function getDb(): Db {
  if (dbSingleton) return dbSingleton;
  client = postgres(getDatabaseUrl(), {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  dbSingleton = drizzle(client, { schema });
  return dbSingleton;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = undefined;
    dbSingleton = undefined;
  }
}

export function createDb(url: string): { db: Db; sql: ReturnType<typeof postgres> } {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}
