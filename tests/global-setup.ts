import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

export default async function setup() {
  const url = "postgres://synapse:synapse_dev_local@127.0.0.1:5432/synapse_hms_test";
  process.env.DATABASE_URL = url;
  process.env.HMS_SECRET = process.env.HMS_SECRET ?? "test-secret-test-secret-test-secret-test-123456";
  process.env.INITIAL_ADMIN_USERNAME = "admin";
  process.env.INITIAL_ADMIN_PASSWORD = "ChangeMe_Admin_1";
  process.env.DEMO_PASSWORD = "Hospital_Demo_1";
  process.env.BACKUP_DIR = "./var/backups-test";
  process.env.DOTENV_CONFIG_QUIET = "true";

  const sql = postgres(url, { max: 1 });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await sql.end({ timeout: 5 });

  const { seedDatabase } = await import("../src/db/seed");
  const { closeDb } = await import("../src/db/client");
  await seedDatabase({ demoUsers: true });
  await closeDb();
}
