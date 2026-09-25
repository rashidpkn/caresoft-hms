import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { AuthContext } from "./auth/session";

type AuditInput = {
  ctx?: AuthContext | null;
  action: string;
  module: string;
  entity: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  result: "success" | "failure";
};

export async function writeAudit(input: AuditInput): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    actorId: input.ctx?.user.id ?? null,
    actorUsername: input.ctx?.user.username ?? null,
    actorRole: input.ctx?.user.roleCode ?? null,
    action: input.action,
    module: input.module,
    entity: input.entity,
    entityId: input.entityId ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    result: input.result,
    ip: input.ctx?.ip ?? null,
    userAgent: input.ctx?.userAgent ?? null,
  });
}
