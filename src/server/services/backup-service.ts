import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb, getDatabaseUrl } from "@/db/client";
import { backupRuns } from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, unavailable } from "../errors";
import type { AuthContext } from "../auth/session";
import { config } from "../config";

function run(cmd: string, args: string[], extraEnv?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...extraEnv } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export async function createBackup(ctx: AuthContext | null, type: "manual" | "scheduled" = "manual") {
  const dir = path.resolve(config.backupDir);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `synapse-hms-${stamp}.sql`;
  const filePath = path.join(dir, filename);
  const parsed = parseDbUrl(getDatabaseUrl());
  const db = getDb();
  const [row] = await db.insert(backupRuns).values({
    filename,
    path: filePath,
    status: "running",
    type,
    triggeredBy: ctx?.user.id ?? null,
  }).returning();

  try {
    const result = await run("pg_dump", [
      "-h", parsed.host,
      "-p", parsed.port,
      "-U", parsed.user,
      "-d", parsed.database,
      "-F", "p",
      "--no-owner",
      "-f", filePath,
    ], { PGPASSWORD: parsed.password });
    if (result.code !== 0) {
      throw new Error("pg_dump failed");
    }
    const buf = await fs.readFile(filePath);
    const checksum = createHash("sha256").update(buf).digest("hex");
    const text = buf.toString("utf8");
    const verified = text.includes("PostgreSQL database dump") || text.includes("CREATE TABLE");
    await db.update(backupRuns).set({
      status: "success",
      sizeBytes: buf.length,
      checksumSha256: checksum,
      verified,
      finishedAt: new Date(),
    }).where(eq(backupRuns.id, row.id));
    if (ctx) await writeAudit({ ctx, action: "backup", module: "system", entity: "backup", entityId: row.id, result: "success" });
    return { id: row.id, filename, sizeBytes: buf.length, checksumSha256: checksum, verified };
  } catch {
    await db.update(backupRuns).set({
      status: "failed",
      error: "Backup failed",
      finishedAt: new Date(),
    }).where(eq(backupRuns.id, row.id));
    if (ctx) await writeAudit({ ctx, action: "backup", module: "system", entity: "backup", entityId: row.id, result: "failure" });
    throw unavailable("Backup failed. Check PostgreSQL client tools on the server.");
  }
}

export async function restoreBackup(ctx: AuthContext, filename: string, confirm: string) {
  if (confirm !== "RESTORE") throw badRequest("Type RESTORE to confirm");
  const dir = path.resolve(config.backupDir);
  const filePath = path.join(dir, path.basename(filename));
  if (!filePath.startsWith(dir)) throw badRequest("Invalid backup path");
  await fs.access(filePath);
  const parsed = parseDbUrl(getDatabaseUrl());
  const result = await run("psql", [
    "-h", parsed.host,
    "-p", parsed.port,
    "-U", parsed.user,
    "-d", parsed.database,
    "-v", "ON_ERROR_STOP=1",
    "-f", filePath,
  ], { PGPASSWORD: parsed.password });
  if (result.code !== 0) {
    await writeAudit({ ctx, action: "restore", module: "system", entity: "backup", result: "failure", newValue: { filename } });
    throw unavailable("Restore failed. The database may need manual recovery.");
  }
  await writeAudit({ ctx, action: "restore", module: "system", entity: "backup", result: "success", newValue: { filename } });
  return { restored: filename };
}

export async function listBackups() {
  return getDb().select({
    id: backupRuns.id,
    filename: backupRuns.filename,
    sizeBytes: backupRuns.sizeBytes,
    checksumSha256: backupRuns.checksumSha256,
    status: backupRuns.status,
    type: backupRuns.type,
    verified: backupRuns.verified,
    startedAt: backupRuns.startedAt,
    finishedAt: backupRuns.finishedAt,
  }).from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(50);
}
