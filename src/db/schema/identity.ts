import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("departments_code_uidx").on(t.code),
]);

export const designations = pgTable("designations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("designations_name_uidx").on(t.name),
]);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("roles_code_uidx").on(t.code),
]);

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  module: text("module").notNull(),
  description: text("description").notNull(),
}, (t) => [
  uniqueIndex("permissions_code_uidx").on(t.code),
]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => [
  uniqueIndex("role_permissions_uidx").on(t.roleId, t.permissionId),
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  employeeId: text("employee_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  departmentId: uuid("department_id").references(() => departments.id),
  designationId: uuid("designation_id").references(() => designations.id),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  failedLoginCount: integer("failed_login_count").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedBy: uuid("deactivated_by"),
  ...timestamps,
}, (t) => [
  uniqueIndex("users_username_uidx").on(t.username),
  uniqueIndex("users_employee_id_uidx").on(t.employeeId),
  index("users_role_idx").on(t.roleId),
  index("users_active_idx").on(t.isActive),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  csrfToken: text("csrf_token").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash),
  index("sessions_user_idx").on(t.userId),
  index("sessions_expires_idx").on(t.expiresAt),
]);
