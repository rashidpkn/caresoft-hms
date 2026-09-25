import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://synapse:synapse_dev_local@127.0.0.1:5432/synapse_hms",
  },
  strict: true,
  verbose: true,
});
