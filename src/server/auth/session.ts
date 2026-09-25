import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { unauthorized } from "../errors";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  departmentId: string | null;
  permissions: string[];
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
  csrfToken: string;
  ip: string | null;
  userAgent: string | null;
};

export async function lookupValidSession(token: string): Promise<{
  sessionId: string;
  csrfToken: string;
  userId: string;
} | null> {
  const db = getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      id: sessions.id,
      csrfToken: sessions.csrfToken,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  const idleMin = Number(process.env.IDLE_TIMEOUT_MINUTES ?? 45);
  if (Date.now() - row.lastSeenAt.getTime() > idleMin * 60_000) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));
    return null;
  }
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
  return { sessionId: row.id, csrfToken: row.csrfToken, userId: row.userId };
}

export async function requireUserById(userId: string): Promise<typeof users.$inferSelect> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !user.isActive) throw unauthorized("Account is inactive");
  return user;
}
