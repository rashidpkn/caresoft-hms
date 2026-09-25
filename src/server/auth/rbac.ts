import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { permissions, rolePermissions, roles, userPermissionOverrides, users } from "@/db/schema";
import { forbidden } from "../errors";
import type { SessionUser } from "./session";

export async function loadSessionUser(userId: string): Promise<SessionUser> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      roleId: users.roleId,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      departmentId: users.departmentId,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user || !user.isActive) {
    throw forbidden("Account is inactive");
  }

  const rolePerms = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, user.roleId));

  const overrides = await db
    .select()
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, user.id));

  const set = new Set(rolePerms.map((p) => p.code));
  for (const o of overrides) {
    if (o.granted) set.add(o.permissionCode);
    else set.delete(o.permissionCode);
  }

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    roleCode: user.roleCode,
    roleName: user.roleName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    departmentId: user.departmentId,
    permissions: [...set].sort(),
  };
}

export function assertPermission(user: SessionUser, permission: string): void {
  if (!user.permissions.includes(permission)) {
    throw forbidden();
  }
}

export function hasPermission(user: SessionUser, permission: string): boolean {
  return user.permissions.includes(permission);
}
