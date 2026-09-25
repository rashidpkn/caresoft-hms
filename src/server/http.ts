import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { assertCsrf, requireAuth } from "./auth/request";
import type { AuthContext } from "./auth/session";
import { writeAudit } from "./audit";

export type Handler = (req: Request, ctx: AuthContext | null) => Promise<unknown>;

export function json(data: unknown, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: init?.headers });
}

export function apiRoute(opts: { auth?: boolean; permission?: string; csrf?: boolean }, handler: Handler) {
  return async (req: Request): Promise<Response> => {
    try {
      let ctx: AuthContext | null = null;
      if (opts.auth !== false) {
        ctx = await requireAuth(req, opts.permission);
        if (opts.csrf !== false) assertCsrf(req, ctx);
      }
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return json({ ok: true, data: result ?? null });
    } catch (err) {
      return handleError(err);
    }
  };
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return json({ ok: false, error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  console.error(err);
  return json(
    { ok: false, error: { code: "internal_error", message: "An unexpected error occurred. Contact the administrator if this continues." } },
    { status: 500 },
  );
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(400, "bad_request", "Invalid JSON body");
  }
}

export function parseSearch(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export async function auditFailure(ctx: AuthContext | null, action: string, module: string, entity: string, message: string) {
  await writeAudit({ ctx, action, module, entity, result: "failure", newValue: { message } });
}
