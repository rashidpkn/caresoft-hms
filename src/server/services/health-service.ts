import os from "node:os";
import fs from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { backupRuns, systemSettings } from "@/db/schema";
import { unavailable } from "../errors";
import { config } from "../config";
import { desc } from "drizzle-orm";

export async function healthCheck() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let dbError: string | null = null;
  try {
    await getDb().execute(sql`select 1 as ok`);
  } catch {
    database = "error";
    dbError = "Database unreachable";
  }
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let diskFreeBytes: number | null = null;
  try {
    const stat = await fs.statfs?.(process.cwd()).catch(() => null);
    if (stat && "bfree" in stat) {
      diskFreeBytes = Number(stat.bfree) * Number(stat.bsize);
    }
  } catch {
    diskFreeBytes = null;
  }
  const backups = await getDb().select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(1);
  const lastBackup = backups[0] ?? null;
  const load = os.loadavg();
  const payload = {
    status: database === "ok" ? "ok" : "degraded",
    app: "ok",
    database,
    dbError,
    uptimeSeconds: Math.round(process.uptime()),
    responseMs: Date.now() - started,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      systemTotal: totalMem,
      systemFree: freeMem,
    },
    cpuLoad1m: load[0],
    diskFreeBytes,
    lastBackup: lastBackup
      ? { status: lastBackup.status, startedAt: lastBackup.startedAt, verified: lastBackup.verified }
      : null,
    version: process.env.npm_package_version ?? "1.0.0",
    lan: true,
    internetRequired: false,
  };
  if (database !== "ok") {
    throw unavailable("Hospital database is not reachable. Check the HMS server and PostgreSQL service.");
  }
  return payload;
}

export async function getSettings() {
  const rows = await getDb().select().from(systemSettings);
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function setSetting(key: string, value: unknown, userId?: string) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO system_settings (key, value, updated_at, updated_by)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, now(), ${userId ?? null})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
  `);
  return { key, value };
}

export const DEFAULT_SETTINGS = {
  hospital: {
    name: "Synapse Hospital",
    address: "Hospital LAN Campus",
    phone: "",
    registrationNo: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
  },
  billing: {
    defaultTaxBps: 0,
    invoiceFooter: "Get well soon.",
    allowDiscounts: true,
  },
  pharmacy: {
    expiryWarningDays: 90,
    allowExpiredSale: false,
  },
  appointment: {
    defaultSlotMinutes: 15,
    allowOverbook: false,
  },
};

export { config };
