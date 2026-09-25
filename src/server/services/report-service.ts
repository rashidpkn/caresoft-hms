import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appointments, auditLogs, encounters, invoices, labOrders, medicineBatches, medicines, patients, payments } from "@/db/schema";

export async function reportPatients(from: Date, to: Date) {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(patients).where(and(gte(patients.createdAt, from), lte(patients.createdAt, to)));
  const recent = await db.select().from(patients).where(and(gte(patients.createdAt, from), lte(patients.createdAt, to))).orderBy(desc(patients.createdAt)).limit(100);
  return { count: Number(row?.count ?? 0), recent };
}

export async function reportAppointments(from: Date, to: Date) {
  const db = getDb();
  return db
    .select({
      status: appointments.status,
      count: sql<number>`count(*)`,
    })
    .from(appointments)
    .where(and(gte(appointments.scheduledAt, from), lte(appointments.scheduledAt, to)))
    .groupBy(appointments.status);
}

export async function reportConsultations(from: Date, to: Date) {
  const db = getDb();
  return db
    .select({
      status: encounters.status,
      count: sql<number>`count(*)`,
    })
    .from(encounters)
    .where(and(gte(encounters.startedAt, from), lte(encounters.startedAt, to)))
    .groupBy(encounters.status);
}

export async function reportPharmacyStock() {
  const db = getDb();
  const low = await db
    .select({
      medicine: medicines.name,
      batch: medicineBatches.batchNumber,
      qty: medicineBatches.quantityOnHand,
      expiry: medicineBatches.expiryDate,
    })
    .from(medicineBatches)
    .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
    .where(sql`${medicineBatches.quantityOnHand} <= ${medicines.reorderLevel}`);
  const expiring = await db
    .select({
      medicine: medicines.name,
      batch: medicineBatches.batchNumber,
      qty: medicineBatches.quantityOnHand,
      expiry: medicineBatches.expiryDate,
    })
    .from(medicineBatches)
    .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
    .where(sql`${medicineBatches.expiryDate} <= (current_date + interval '90 days')`);
  return { low, expiring };
}

export async function reportLab(from: Date, to: Date) {
  const db = getDb();
  return db
    .select({ status: labOrders.status, count: sql<number>`count(*)` })
    .from(labOrders)
    .where(and(gte(labOrders.createdAt, from), lte(labOrders.createdAt, to)))
    .groupBy(labOrders.status);
}

export async function reportAudit(from: Date, to: Date) {
  const db = getDb();
  return db.select().from(auditLogs).where(and(gte(auditLogs.createdAt, from), lte(auditLogs.createdAt, to))).orderBy(desc(auditLogs.createdAt)).limit(500);
}

export async function dashboardFor(roleCode: string, userId: string) {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const [patientCount] = await db.select({ c: sql<number>`count(*)` }).from(patients);
  const [openInvoices] = await db.select({ c: sql<number>`count(*)` }).from(invoices).where(sql`${invoices.status} in ('open','partial')`);
  const [todayAppt] = await db.select({ c: sql<number>`count(*)` }).from(appointments).where(and(gte(appointments.scheduledAt, todayStart), lte(appointments.scheduledAt, todayEnd)));
  const [pendingLab] = await db.select({ c: sql<number>`count(*)` }).from(labOrders).where(sql`${labOrders.status} not in ('completed','cancelled')`);
  const [todayRevenue] = await db.select({ c: sql<number>`coalesce(sum(${payments.amountCents}),0)` }).from(payments).where(and(gte(payments.receivedAt, todayStart), lte(payments.receivedAt, todayEnd)));
  return {
    roleCode,
    userId,
    patientCount: Number(patientCount?.c ?? 0),
    todayAppointments: Number(todayAppt?.c ?? 0),
    openInvoices: Number(openInvoices?.c ?? 0),
    pendingLab: Number(pendingLab?.c ?? 0),
    todayRevenueCents: Number(todayRevenue?.c ?? 0),
  };
}

export async function searchAudit(opts: { q?: string; module?: string }) {
  const db = getDb();
  const filters = [];
  if (opts.module) filters.push(eq(auditLogs.module, opts.module));
  if (opts.q) {
    const term = `%${opts.q}%`;
    filters.push(sql`${auditLogs.action} ilike ${term} or ${auditLogs.actorUsername} ilike ${term}`);
  }
  return db.select().from(auditLogs).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditLogs.createdAt)).limit(200);
}
