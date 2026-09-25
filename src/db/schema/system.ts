import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const sequences = pgTable("sequences", {
  key: text("key").primaryKey(),
  prefix: text("prefix").notNull(),
  lastValue: integer("last_value").notNull().default(0),
  padding: integer("padding").notNull().default(6),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id"),
  actorUsername: text("actor_username"),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  module: text("module").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  result: text("result").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  index("audit_logs_entity_idx").on(t.entity, t.entityId),
  index("audit_logs_module_idx").on(t.module, t.createdAt),
  index("audit_logs_created_idx").on(t.createdAt),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  sizeBytes: integer("size_bytes"),
  checksumSha256: text("checksum_sha256"),
  status: text("status").notNull(),
  type: text("type").notNull(),
  verified: boolean("verified").default(false).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  triggeredBy: uuid("triggered_by").references(() => users.id),
});

export const userPermissionOverrides = pgTable("user_permission_overrides", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionCode: text("permission_code").notNull(),
  granted: boolean("granted").notNull(),
}, (t) => [
  uniqueIndex("user_permission_overrides_uidx").on(t.userId, t.permissionCode),
]);
