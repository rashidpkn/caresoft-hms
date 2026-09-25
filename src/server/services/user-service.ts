import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { departments, designations, doctors, roles, sessions, users } from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import type { AuthContext } from "../auth/session";
import { hashPassword } from "../auth/password";
import { ROLE_CODES } from "../auth/permissions";

const createUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  employeeId: z.string().min(2).max(32),
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  password: z.string().min(10),
  roleCode: z.enum(ROLE_CODES),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
});

export async function createUser(ctx: AuthContext, input: unknown) {
  const parsed = createUserSchema.parse(input);
  const db = getDb();
  const role = (await db.select().from(roles).where(eq(roles.code, parsed.roleCode)).limit(1))[0];
  if (!role) throw badRequest("Unknown role");
  const passwordHash = await hashPassword(parsed.password);
  try {
    const [created] = await db.insert(users).values({
      username: parsed.username.toLowerCase(),
      employeeId: parsed.employeeId,
      fullName: parsed.fullName,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      passwordHash,
      roleId: role.id,
      departmentId: parsed.departmentId ?? null,
      designationId: parsed.designationId ?? null,
      mustChangePassword: true,
    }).returning();
    await writeAudit({
      ctx,
      action: "create",
      module: "admin",
      entity: "user",
      entityId: created.id,
      newValue: { username: created.username, role: parsed.roleCode },
      result: "success",
    });
    return sanitizeUser(created, role.code, role.name);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("users_username_uidx") || msg.includes("users_employee_id_uidx")) {
      throw conflict("Username or employee ID already exists");
    }
    throw e;
  }
}

export async function updateUser(ctx: AuthContext, id: string, input: unknown) {
  const schema = z.object({
    fullName: z.string().min(2).max(120).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(20).nullable().optional(),
    roleCode: z.enum(ROLE_CODES).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    designationId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.parse(input);
  const db = getDb();
  const existing = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!existing) throw notFound("User not found");
  let roleId = existing.roleId;
  if (parsed.roleCode) {
    const role = (await db.select().from(roles).where(eq(roles.code, parsed.roleCode)).limit(1))[0];
    if (!role) throw badRequest("Unknown role");
    roleId = role.id;
  }
  const [updated] = await db.update(users).set({
    fullName: parsed.fullName ?? existing.fullName,
    email: parsed.email === undefined ? existing.email : parsed.email,
    phone: parsed.phone === undefined ? existing.phone : parsed.phone,
    roleId,
    departmentId: parsed.departmentId === undefined ? existing.departmentId : parsed.departmentId,
    designationId: parsed.designationId === undefined ? existing.designationId : parsed.designationId,
    updatedAt: new Date(),
  }).where(eq(users.id, id)).returning();
  await writeAudit({ ctx, action: "update", module: "admin", entity: "user", entityId: id, previousValue: { roleId: existing.roleId }, newValue: parsed, result: "success" });
  return updated;
}

export async function setUserActive(ctx: AuthContext, id: string, isActive: boolean) {
  if (id === ctx.user.id) throw badRequest("You cannot disable your own account");
  const db = getDb();
  const [updated] = await db.update(users).set({
    isActive,
    deactivatedAt: isActive ? null : new Date(),
    deactivatedBy: isActive ? null : ctx.user.id,
    updatedAt: new Date(),
  }).where(eq(users.id, id)).returning();
  if (!updated) throw notFound("User not found");
  if (!isActive) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
  }
  await writeAudit({ ctx, action: isActive ? "reactivate" : "disable", module: "admin", entity: "user", entityId: id, result: "success" });
  return sanitizePublic(updated);
}

export async function resetPassword(ctx: AuthContext, id: string, password: string) {
  const db = getDb();
  const passwordHash = await hashPassword(password);
  const [updated] = await db.update(users).set({
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(users.id, id)).returning();
  if (!updated) throw notFound("User not found");
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
  await writeAudit({ ctx, action: "reset_password", module: "admin", entity: "user", entityId: id, result: "success" });
  return { ok: true };
}

export async function listUsers(query: { q?: string; role?: string; active?: string; page?: number }) {
  const db = getDb();
  const page = Math.max(1, query.page ?? 1);
  const limit = 25;
  const filters = [];
  if (query.q) {
    const q = `%${query.q}%`;
    filters.push(or(ilike(users.username, q), ilike(users.fullName, q), ilike(users.employeeId, q)));
  }
  if (query.role) filters.push(eq(roles.code, query.role));
  if (query.active === "true") filters.push(eq(users.isActive, true));
  if (query.active === "false") filters.push(eq(users.isActive, false));
  const where = filters.length ? and(...filters) : undefined;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      employeeId: users.employeeId,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      lastLoginIp: users.lastLoginIp,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      roleCode: roles.code,
      roleName: roles.name,
      departmentName: departments.name,
      designationName: designations.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(designations, eq(users.designationId, designations.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return { items: rows, page };
}

export async function listRoles() {
  const db = getDb();
  return db.select().from(roles).orderBy(roles.name);
}

export async function listDepartments() {
  const db = getDb();
  return db.select().from(departments).orderBy(departments.name);
}

export async function upsertDepartment(ctx: AuthContext, input: { id?: string; code: string; name: string; isActive?: boolean }) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(departments).set({
      code: input.code,
      name: input.name,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(departments.id, input.id)).returning();
    await writeAudit({ ctx, action: "update", module: "admin", entity: "department", entityId: input.id, result: "success" });
    return row;
  }
  const [row] = await db.insert(departments).values({ code: input.code, name: input.name }).returning();
  await writeAudit({ ctx, action: "create", module: "admin", entity: "department", entityId: row.id, result: "success" });
  return row;
}

export async function upsertDesignation(ctx: AuthContext, input: { id?: string; name: string; departmentId?: string | null; isActive?: boolean }) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(designations).set({
      name: input.name,
      departmentId: input.departmentId ?? null,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(designations.id, input.id)).returning();
    return row;
  }
  const [row] = await db.insert(designations).values({
    name: input.name,
    departmentId: input.departmentId ?? null,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "admin", entity: "designation", entityId: row.id, result: "success" });
  return row;
}

export async function listDesignations() {
  return getDb().select().from(designations).orderBy(designations.name);
}

export async function upsertDoctor(ctx: AuthContext, input: {
  userId: string;
  departmentId?: string | null;
  specialization: string;
  qualifications?: string;
  licenseNo?: string;
  consultationFeeCents: number;
  followUpFeeCents?: number;
  isActive?: boolean;
}) {
  const db = getDb();
  const existing = (await db.select().from(doctors).where(eq(doctors.userId, input.userId)).limit(1))[0];
  if (existing) {
    const [row] = await db.update(doctors).set({
      departmentId: input.departmentId ?? null,
      specialization: input.specialization,
      qualifications: input.qualifications ?? null,
      licenseNo: input.licenseNo ?? null,
      consultationFeeCents: input.consultationFeeCents,
      followUpFeeCents: input.followUpFeeCents ?? existing.followUpFeeCents,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(doctors.id, existing.id)).returning();
    await writeAudit({ ctx, action: "update", module: "admin", entity: "doctor", entityId: row.id, result: "success" });
    return row;
  }
  const [row] = await db.insert(doctors).values({
    userId: input.userId,
    departmentId: input.departmentId ?? null,
    specialization: input.specialization,
    qualifications: input.qualifications ?? null,
    licenseNo: input.licenseNo ?? null,
    consultationFeeCents: input.consultationFeeCents,
    followUpFeeCents: input.followUpFeeCents ?? 0,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "admin", entity: "doctor", entityId: row.id, result: "success" });
  return row;
}

export async function listDoctors() {
  const db = getDb();
  return db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      fullName: users.fullName,
      specialization: doctors.specialization,
      qualifications: doctors.qualifications,
      licenseNo: doctors.licenseNo,
      consultationFeeCents: doctors.consultationFeeCents,
      followUpFeeCents: doctors.followUpFeeCents,
      isActive: doctors.isActive,
      departmentName: departments.name,
      departmentId: doctors.departmentId,
    })
    .from(doctors)
    .innerJoin(users, eq(doctors.userId, users.id))
    .leftJoin(departments, eq(doctors.departmentId, departments.id))
    .orderBy(users.fullName);
}

function sanitizeUser(u: typeof users.$inferSelect, roleCode: string, roleName: string) {
  return {
    id: u.id,
    username: u.username,
    employeeId: u.employeeId,
    fullName: u.fullName,
    email: u.email,
    roleCode,
    roleName,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
  };
}

function sanitizePublic(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    employeeId: u.employeeId,
    fullName: u.fullName,
    isActive: u.isActive,
  };
}

export { sql };
