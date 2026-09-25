import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { writeAudit } from "../audit";
import { config, cookieHeader, clearCookieHeader } from "../config";
import { badRequest, forbidden, tooMany, unauthorized } from "../errors";
import { hashPassword, verifyPassword } from "../auth/password";
import { loadSessionUser } from "../auth/rbac";
import { hashToken, newOpaqueToken, type AuthContext } from "../auth/session";

const loginSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(1).max(200),
});

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string | null): void {
  const key = ip ?? "unknown";
  const now = Date.now();
  const rec = ipAttempts.get(key);
  if (!rec || rec.resetAt < now) {
    ipAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }
  rec.count += 1;
  if (rec.count > 30) throw tooMany();
}

export async function login(input: unknown, meta: { ip: string | null; userAgent: string | null }) {
  const parsed = loginSchema.parse(input);
  checkIpRateLimit(meta.ip);
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.username, parsed.username.trim().toLowerCase())).limit(1);
  const user = rows[0];
  if (!user) {
    await writeAudit({ action: "login", module: "auth", entity: "user", result: "failure", newValue: { username: parsed.username } });
    throw unauthorized("Invalid username or password");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw tooMany("Account temporarily locked");
  }
  if (!user.isActive) {
    throw forbidden("Account is disabled");
  }
  const ok = await verifyPassword(user.passwordHash, parsed.password);
  if (!ok) {
    const fails = user.failedLoginCount + 1;
    const lockedUntil = fails >= config.loginMaxAttempts
      ? new Date(Date.now() + config.loginLockMinutes * 60_000)
      : null;
    await db.update(users).set({ failedLoginCount: fails, lockedUntil, updatedAt: new Date() }).where(eq(users.id, user.id));
    await writeAudit({ action: "login", module: "auth", entity: "user", entityId: user.id, result: "failure" });
    throw unauthorized("Invalid username or password");
  }

  const token = newOpaqueToken();
  const csrfToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      csrfToken,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });
    await tx.update(users).set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
  });

  const sessionUser = await loadSessionUser(user.id);
  await writeAudit({
    ctx: { user: sessionUser, sessionId: "", csrfToken, ip: meta.ip, userAgent: meta.userAgent },
    action: "login",
    module: "auth",
    entity: "user",
    entityId: user.id,
    result: "success",
  });

  return {
    token,
    setCookie: cookieHeader(token, config.sessionTtlHours * 3600),
    user: sessionUser,
    csrfToken,
  };
}

export async function logout(ctx: AuthContext) {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, ctx.sessionId));
  await writeAudit({ ctx, action: "logout", module: "auth", entity: "session", entityId: ctx.sessionId, result: "success" });
  return { setCookie: clearCookieHeader() };
}

export async function logoutAll(ctx: AuthContext, userId: string) {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  await writeAudit({ ctx, action: "revoke_sessions", module: "auth", entity: "user", entityId: userId, result: "success" });
}

export async function changePassword(ctx: AuthContext, input: { currentPassword: string; newPassword: string }) {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
  const user = rows[0];
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw badRequest("Current password is incorrect");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.update(users).set({
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
  await writeAudit({ ctx, action: "change_password", module: "auth", entity: "user", entityId: user.id, result: "success" });
}

export async function listActiveSessions(userId: string) {
  const db = getDb();
  return db.select({
    id: sessions.id,
    ip: sessions.ip,
    userAgent: sessions.userAgent,
    createdAt: sessions.createdAt,
    lastSeenAt: sessions.lastSeenAt,
    expiresAt: sessions.expiresAt,
  }).from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
}
