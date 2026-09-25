import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createBackup } from "../src/server/services/backup-service";
import { closeDb } from "../src/db/client";

createBackup(null, "scheduled")
  .then((r) => {
    console.log("Backup created", r);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());
