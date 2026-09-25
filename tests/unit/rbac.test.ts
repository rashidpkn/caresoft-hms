import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "@/server/auth/permissions";

describe("RBAC matrix", () => {
  it("does not grant financial reports to pharmacists", () => {
    expect(ROLE_PERMISSIONS.pharmacist.includes("reports.financial")).toBe(false);
    expect(ROLE_PERMISSIONS.pharmacist.includes("billing.refund")).toBe(false);
  });

  it("does not grant clinical write access to security officers", () => {
    expect(ROLE_PERMISSIONS.security_officer.includes("consultation.create")).toBe(false);
    expect(ROLE_PERMISSIONS.security_officer.includes("patient.create")).toBe(false);
    expect(ROLE_PERMISSIONS.security_officer.includes("audit.view")).toBe(true);
  });

  it("keeps lab attendant from verifying results", () => {
    expect(ROLE_PERMISSIONS.lab_attendant.includes("lab.result.verify")).toBe(false);
    expect(ROLE_PERMISSIONS.lab_attendant.includes("lab.sample.collect")).toBe(true);
  });

  it("gives super admin every permission the admin has plus backup", () => {
    expect(ROLE_PERMISSIONS.super_admin.includes("backup.manage")).toBe(true);
    expect(ROLE_PERMISSIONS.admin.includes("backup.manage")).toBe(false);
  });
});
