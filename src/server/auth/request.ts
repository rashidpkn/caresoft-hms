import { cookies } from "next/headers";
import { config } from "../config";
import { unauthorized, forbidden } from "../errors";
import { assertPermission, loadSessionUser } from "./rbac";
import { lookupValidSession, type AuthContext } from "./session";

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
}

export async function getAuthFromRequest(req: Request): Promise<AuthContext | null> {
  const headerCookie = req.headers.get("cookie") ?? "";
  const match = headerCookie.match(new RegExp(`(?:^|;\\s*)${config.cookieName}=([^;]+)`));
  const token = match?.[1];
  if (!token) return null;
  const session = await lookupValidSession(token);
  if (!session) return null;
  const user = await loadSessionUser(session.userId);
  return {
    user,
    sessionId: session.sessionId,
    csrfToken: session.csrfToken,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  };
}

export async function requireAuth(req: Request, permission?: string): Promise<AuthContext> {
  const ctx = await getAuthFromRequest(req);
  if (!ctx) throw unauthorized();
  const path = new URL(req.url).pathname;
  const allowedWhileMustChange =
    path.endsWith("/auth/me") ||
    path.endsWith("/auth/logout") ||
    path.endsWith("/auth/password") ||
    path.endsWith("/health/public");
  if (ctx.user.mustChangePassword && !allowedWhileMustChange) {
    throw forbidden("Password change required before continuing");
  }
  if (permission) assertPermission(ctx.user, permission);
  return ctx;
}

export function assertCsrf(req: Request, ctx: AuthContext): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const header = req.headers.get("x-csrf-token");
  if (!header || header !== ctx.csrfToken) {
    throw forbidden("Invalid CSRF token");
  }
}

export async function getCookieToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(config.cookieName)?.value;
}
