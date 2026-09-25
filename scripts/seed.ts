import { config as loadEnv } from "dotenv";
if (!process.env.DATABASE_URL) {
  loadEnv({ path: ".env.local" });
  loadEnv();
}
import { seedDatabase } from "../src/db/seed";
import { closeDb } from "../src/db/client";

const demo = process.argv.includes("--demo");
seedDatabase({ demoUsers: demo })
  .then(() => {
    console.log("Seed complete", demo ? "(demo users included)" : "");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());
