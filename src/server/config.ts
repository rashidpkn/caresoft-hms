function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: (process.env.NODE_ENV ?? "development") === "production",
  cookieName: process.env.COOKIE_NAME ?? "synapse_session",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  idleTimeoutMinutes: Number(process.env.IDLE_TIMEOUT_MINUTES ?? 45),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 8),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? 15),
  backupDir: process.env.BACKUP_DIR ?? "./var/backups",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3000",
  corsOrigin: process.env.CORS_ORIGIN ?? "",
  secret: () => required("HMS_SECRET", "dev-only-secret-do-not-use-in-production-please-change"),
};

export function cookieHeader(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${config.cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader(): string {
  return `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
