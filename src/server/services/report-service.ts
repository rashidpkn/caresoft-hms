import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appointments, auditLogs, encounters, invoices, labOrders, medicineBatches, medicines, patients, payments } from "@/db/schema";

/** Reports intentionally return aggregates only; row-level access goes through module APIs. */

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

export async function reportRevenue(from: Date, to: Date) {
  const db = getDb();
  const [row] = await db
    .select({
      collectedCents: sql<number>`coalesce(sum(${payments.amountCents}),0)`,
      paymentCount: sql<number>`count(*)`,
    })
    .from(payments)
    .where(and(gte(payments.receivedAt, from), lte(payments.receivedAt, to)));
  const byMethod = await db
    .select({ method: payments.method, totalCents: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(gte(payments.receivedAt, from), lte(payments.receivedAt, to)))
    .groupBy(payments.method);
  const [invoiceRow] = await db
    .select({
      invoiced: sql<number>`coalesce(sum(${invoices.totalCents}),0)`,
      outstanding: sql<number>`coalesce(sum(${invoices.totalCents} - ${invoices.paidCents} + ${invoices.refundedCents}),0)`,
    })
    .from(invoices)
    .where(and(gte(invoices.createdAt, from), lte(invoices.createdAt, to), sql`${invoices.status} <> 'cancelled'`));
  return {
    collectedCents: Number(row?.collectedCents ?? 0),
    paymentCount: Number(row?.paymentCount ?? 0),
    invoicedCents: Number(invoiceRow?.invoiced ?? 0),
    outstandingCents: Number(invoiceRow?.outstanding ?? 0),
    byMethod,
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
