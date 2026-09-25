import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  appointments,
  billableServices,
  departments,
  designations,
  doctors,
  doctorSchedules,
  inventoryMovements,
  labCategories,
  labOrderItems,
  labOrders,
  labTests,
  medicineBatches,
  medicineCategories,
  medicines,
  patientContacts,
  patients,
  permissions,
  purchaseItems,
  purchases,
  queues,
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
import { ensureSequences, nextFormattedNumber } from "@/server/sequences";

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

  if (opts?.demoUsers) {
    await seedDemoWorkload();
  }

  return { ok: true };
}

/**
 * Development-only sample workload so every role has something to act on:
 * patients, a booked and a checked-in appointment, dispensable stock, and a lab order.
 * Never run this on a live hospital database.
 */
async function seedDemoWorkload() {
  const db = getDb();
  const existing = await db.select({ id: patients.id }).from(patients).limit(1);
  if (existing.length > 0) return;

  const doctorRow = (await db.select().from(doctors).limit(1))[0];
  const supplier = (await db.select().from(suppliers).limit(1))[0];
  const storeUser = (await db.select().from(users).where(eq(users.username, "store")).limit(1))[0];
  const receptionUser = (await db.select().from(users).where(eq(users.username, "receptionist")).limit(1))[0];
  const doctorUser = (await db.select().from(users).where(eq(users.username, "doctor")).limit(1))[0];

  const demoPatients = [
    { firstName: "Meera", lastName: "Shah", sex: "female", dateOfBirth: "1992-05-14", phone: "9876543210", allergies: "Penicillin" },
    { firstName: "Rahul", lastName: "Verma", sex: "male", dateOfBirth: "1979-11-02", phone: "9876500011", allergies: null },
    { firstName: "Fatima", lastName: "Rahman", sex: "female", dateOfBirth: "2015-02-20", phone: "9876500022", allergies: null },
  ];
  const created: { id: string; mrn: string }[] = [];
  for (const p of demoPatients) {
    const row = await db.transaction(async (tx) => {
      const mrn = await nextFormattedNumber(tx, "patient_mrn");
      const [inserted] = await tx.insert(patients).values({
        mrn,
        firstName: p.firstName,
        lastName: p.lastName,
        sex: p.sex,
        dateOfBirth: p.dateOfBirth,
        allergies: p.allergies,
        registeredBy: receptionUser?.id ?? null,
      }).returning();
      await tx.insert(patientContacts).values({ patientId: inserted.id, type: "phone", value: p.phone, isPrimary: true });
      return inserted;
    });
    created.push({ id: row.id, mrn: row.mrn });
  }

  if (doctorRow) {
    const today = new Date().toISOString().slice(0, 10);
    const first = new Date(`${today}T10:00:00.000Z`);
    const second = new Date(`${today}T10:15:00.000Z`);
    const [checkedIn] = await db.insert(appointments).values({
      patientId: created[0].id,
      doctorId: doctorRow.id,
      scheduledAt: first,
      reason: "Fever and cough",
      status: "checked_in",
      checkedInAt: new Date(),
      createdBy: receptionUser?.id ?? null,
    }).returning();
    await db.insert(queues).values({
      doctorId: doctorRow.id,
      appointmentId: checkedIn.id,
      patientId: created[0].id,
      queueDate: today,
      tokenNumber: 1,
      status: "waiting",
    });
    await db.insert(appointments).values({
      patientId: created[1].id,
      doctorId: doctorRow.id,
      scheduledAt: second,
      reason: "Blood pressure review",
      status: "scheduled",
      createdBy: receptionUser?.id ?? null,
    });
  }

  if (supplier) {
    const meds = await db.select().from(medicines).limit(2);
    const today = new Date().toISOString().slice(0, 10);
    await db.transaction(async (tx) => {
      const purchaseNo = await nextFormattedNumber(tx, "purchase");
      const [purchase] = await tx.insert(purchases).values({
        purchaseNo,
        supplierId: supplier.id,
        invoiceNo: "DEMO-001",
        purchasedAt: today,
        status: "received",
        createdBy: storeUser?.id ?? null,
      }).returning();
      let subtotal = 0;
      let tax = 0;
      for (const [index, med] of meds.entries()) {
        const quantity = index === 0 ? 120 : 8;
        const purchaseRateCents = 1800;
        const [batch] = await tx.insert(medicineBatches).values({
          medicineId: med.id,
          batchNumber: index === 0 ? "B24A01" : "B24B07",
          packing: "10 x 10",
          stripCount: 10,
          mrpCents: 3500,
          unitPriceCents: 3200,
          purchaseRateCents,
          gstBps: 1200,
          quantityOnHand: quantity,
          supplierId: supplier.id,
          expiryDate: index === 0 ? "2028-06-30" : "2026-12-31",
          receivedAt: today,
        }).returning();
        await tx.insert(inventoryMovements).values({
          batchId: batch.id,
          medicineId: med.id,
          type: "purchase",
          quantityDelta: quantity,
          quantityAfter: quantity,
          referenceType: "purchase",
          referenceId: purchase.id,
          createdBy: storeUser?.id ?? null,
        });
        const lineGross = quantity * purchaseRateCents;
        subtotal += lineGross;
        tax += Math.round((lineGross * 1200) / 10000);
        await tx.insert(purchaseItems).values({
          purchaseId: purchase.id,
          medicineId: med.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity,
          purchaseRateCents,
          mrpCents: 3500,
          gstBps: 1200,
          lineTotalCents: lineGross + Math.round((lineGross * 1200) / 10000),
        });
      }
      await tx.update(purchases).set({ subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax }).where(eq(purchases.id, purchase.id));
    });
  }

  const test = (await db.select().from(labTests).limit(1))[0];
  if (test) {
    await db.transaction(async (tx) => {
      const orderNo = await nextFormattedNumber(tx, "lab_order");
      const [order] = await tx.insert(labOrders).values({
        orderNo,
        patientId: created[1].id,
        orderedBy: doctorUser?.id ?? null,
        status: "ordered",
        priority: "routine",
        clinicalNotes: "Rule out anaemia",
      }).returning();
      await tx.insert(labOrderItems).values({ orderId: order.id, testId: test.id, status: "ordered" });
    });
  }
}

export { sequences };
