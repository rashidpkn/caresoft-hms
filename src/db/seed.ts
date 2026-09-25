import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  billableServices,
  departments,
  designations,
  doctors,
  doctorSchedules,
  labCategories,
  labTests,
  medicineCategories,
  medicines,
  permissions,
  rolePermissions,
  roles,
  sequences,
  suppliers,
  systemSettings,
  users,
} from "@/db/schema";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, type RoleCode } from "@/server/auth/permissions";
import { hashPassword } from "@/server/auth/password";
import { DEFAULT_SETTINGS } from "@/server/services/health-service";
import { ensureSequences } from "@/server/sequences";

export async function seedDatabase(opts?: { demoUsers?: boolean }) {
  const db = getDb();

  for (const p of ALL_PERMISSIONS) {
    await db.insert(permissions).values(p).onConflictDoNothing({ target: permissions.code });
  }

  const roleRows: Record<string, string> = {};
  const roleNames: Record<RoleCode, string> = {
    super_admin: "Super Admin",
    admin: "Administrator",
    doctor: "Doctor",
    nurse: "Nurse",
    receptionist: "Receptionist",
    pharmacist: "Pharmacist",
    store_manager: "Store Manager",
    lab_technician: "Lab Technician",
    lab_attendant: "Lab Attendant",
    lab_verifier: "Lab Verifier",
    accountant: "Accountant",
    security_officer: "Security Officer",
  };
  for (const code of Object.keys(roleNames) as RoleCode[]) {
    await db.insert(roles).values({
      code,
      name: roleNames[code],
      isSystem: true,
      description: `${roleNames[code]} role`,
    }).onConflictDoNothing({ target: roles.code });
    const row = (await db.select().from(roles).where(eq(roles.code, code)).limit(1))[0];
    roleRows[code] = row.id;
  }

  const permRows = await db.select().from(permissions);
  const permByCode = new Map(permRows.map((p) => [p.code, p.id]));
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleRows[roleCode];
    for (const code of codes) {
      const permissionId = permByCode.get(code);
      if (!permissionId) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
    }
  }

  await ensureSequences(db);

  const deptSeed = [
    { code: "GEN", name: "General Medicine" },
    { code: "PED", name: "Pediatrics" },
    { code: "ORT", name: "Orthopedics" },
    { code: "GYN", name: "Obstetrics & Gynaecology" },
    { code: "PHR", name: "Pharmacy" },
    { code: "LAB", name: "Laboratory" },
    { code: "ADM", name: "Administration" },
  ];
  for (const d of deptSeed) {
    await db.insert(departments).values(d).onConflictDoNothing({ target: departments.code });
  }
  const gen = (await db.select().from(departments).where(eq(departments.code, "GEN")))[0];
  await db.insert(designations).values(
    ["Consultant", "Staff Nurse", "Front Desk", "Pharmacist", "Lab Technician"].map((name) => ({ name, departmentId: gen?.id ?? null })),
  ).onConflictDoNothing({ target: designations.name });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(systemSettings).values({ key, value }).onConflictDoNothing({ target: systemSettings.key });
  }

  await db.insert(billableServices).values([
    { code: "CONSULT", name: "Consultation", category: "consultation", priceCents: 40000, taxBps: 0 },
    { code: "FOLLOWUP", name: "Follow-up visit", category: "consultation", priceCents: 20000, taxBps: 0 },
    { code: "REG", name: "Registration fee", category: "service", priceCents: 5000, taxBps: 0 },
  ]).onConflictDoNothing({ target: billableServices.code });

  await db.insert(medicineCategories).values([{ name: "General" }, { name: "Antibiotic" }, { name: "Analgesic" }]).onConflictDoNothing({ target: medicineCategories.name });
  const cat = (await db.select().from(medicineCategories).where(eq(medicineCategories.name, "Analgesic")))[0];
  await db.insert(medicines).values([
    { sku: "PCM500", name: "Paracetamol 500mg", genericName: "Paracetamol", brand: "Generic", categoryId: cat?.id, unit: "strip", strength: "500mg", gstBps: 1200, reorderLevel: 20 },
    { sku: "AMX500", name: "Amoxicillin 500mg", genericName: "Amoxicillin", brand: "Generic", categoryId: cat?.id, unit: "strip", strength: "500mg", gstBps: 1200, reorderLevel: 15 },
  ]).onConflictDoNothing({ target: medicines.sku });

  await db.insert(suppliers).values([
    { code: "SUP001", name: "National Pharma Distributors", phone: "0000000000" },
  ]).onConflictDoNothing({ target: suppliers.code });

  await db.insert(labCategories).values([{ name: "Hematology" }, { name: "Biochemistry" }]).onConflictDoNothing({ target: labCategories.name });
  const hema = (await db.select().from(labCategories).where(eq(labCategories.name, "Hematology")))[0];
  const bio = (await db.select().from(labCategories).where(eq(labCategories.name, "Biochemistry")))[0];
  await db.insert(labTests).values([
    { code: "CBC", name: "Complete Blood Count", categoryId: hema?.id, specimenType: "blood", priceCents: 35000, unit: "", referenceRange: "See differential" },
    { code: "FBS", name: "Fasting Blood Sugar", categoryId: bio?.id, specimenType: "blood", priceCents: 12000, unit: "mg/dL", referenceRange: "70-100" },
  ]).onConflictDoNothing({ target: labTests.code });

  const adminUser = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe_Admin_1";
  const existingAdmin = (await db.select().from(users).where(eq(users.username, adminUser.toLowerCase())).limit(1))[0];
  if (!existingAdmin) {
    await db.insert(users).values({
      username: adminUser.toLowerCase(),
      employeeId: "EMP-0001",
      fullName: process.env.INITIAL_ADMIN_FULL_NAME ?? "System Administrator",
      passwordHash: await hashPassword(adminPass),
      roleId: roleRows.super_admin,
      mustChangePassword: false,
    });
  }

  if (opts?.demoUsers) {
    const demo: { username: string; role: RoleCode; name: string; employeeId: string }[] = [
      { username: "receptionist", role: "receptionist", name: "Rina Reception", employeeId: "EMP-1001" },
      { username: "doctor", role: "doctor", name: "Dr. Arun Kumar", employeeId: "EMP-1002" },
      { username: "pharmacist", role: "pharmacist", name: "Priya Pharmacy", employeeId: "EMP-1003" },
      { username: "store", role: "store_manager", name: "Suresh Store", employeeId: "EMP-1004" },
      { username: "labtech", role: "lab_technician", name: "Leena Lab", employeeId: "EMP-1005" },
      { username: "labatt", role: "lab_attendant", name: "Amit Attendant", employeeId: "EMP-1006" },
      { username: "labver", role: "lab_verifier", name: "Dr. Vera Labs", employeeId: "EMP-1007" },
      { username: "accountant", role: "accountant", name: "Anil Accounts", employeeId: "EMP-1008" },
      { username: "nurse", role: "nurse", name: "Nisha Nurse", employeeId: "EMP-1009" },
      { username: "security", role: "security_officer", name: "Sam Security", employeeId: "EMP-1010" },
    ];
    const demoPassword = process.env.DEMO_PASSWORD ?? "Hospital_Demo_1";
    const hash = await hashPassword(demoPassword);
    for (const d of demo) {
      const exists = (await db.select().from(users).where(eq(users.username, d.username)).limit(1))[0];
      if (exists) continue;
      const [u] = await db.insert(users).values({
        username: d.username,
        employeeId: d.employeeId,
        fullName: d.name,
        passwordHash: hash,
        roleId: roleRows[d.role],
        mustChangePassword: false,
      }).returning();
      if (d.role === "doctor") {
        const [doc] = await db.insert(doctors).values({
          userId: u.id,
          departmentId: gen?.id ?? null,
          specialization: "General Medicine",
          qualifications: "MBBS, MD",
          licenseNo: "MED-1002",
          consultationFeeCents: 40000,
          followUpFeeCents: 20000,
        }).returning();
        await db.insert(doctorSchedules).values(
          [1, 2, 3, 4, 5, 6].map((weekday) => ({
            doctorId: doc.id,
            weekday,
            startTime: "09:00",
            endTime: "17:00",
            slotMinutes: 15,
          })),
        );
      }
    }
  }

  return { ok: true };
}

export { sequences };
