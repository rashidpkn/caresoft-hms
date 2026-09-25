import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  appointments,
  auditLogs,
  doctors,
  encounters,
  invoices,
  labOrderItems,
  labOrders,
  labResults,
  medicineBatches,
  medicines,
  patients,
  payments,
  queues,
  users,
} from "@/db/schema";
import type { SessionUser } from "../auth/session";
import { hasPermission } from "../auth/rbac";

export type DashboardCard = {
  key: string;
  label: string;
  value: string;
  tone: "default" | "warn" | "danger";
  hint?: string;
};

export type Dashboard = {
  roleCode: string;
  roleName: string;
  headline: string;
  cards: DashboardCard[];
  doctor?: {
    doctorId: string | null;
    queue: { queueId: string; tokenNumber: number; status: string; patientName: string; patientMrn: string; appointmentId: string; patientId: string }[];
    draftEncounters: { id: string; patientName: string; startedAt: string }[];
  };
  pharmacy?: {
    lowStock: { medicine: string; batchNumber: string; quantityOnHand: number; reorderLevel: number }[];
    expiring: { medicine: string; batchNumber: string; quantityOnHand: number; expiryDate: string }[];
  };
  lab?: {
    toCollect: number;
    processing: number;
    awaitingVerification: number;
    completedToday: number;
  };
  reception?: {
    today: { id: string; scheduledAt: string; status: string; patientName: string; doctorName: string }[];
    unpaidInvoices: number;
  };
};

function dayRange(): { start: Date; end: Date; isoDate: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end, isoDate: start.toISOString().slice(0, 10) };
}

const patientFullName = sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`;

export async function dashboardFor(user: SessionUser): Promise<Dashboard> {
  const db = getDb();
  const { start, end, isoDate } = dayRange();
  const cards: DashboardCard[] = [];
  const result: Dashboard = {
    roleCode: user.roleCode,
    roleName: user.roleName,
    headline: headlineFor(user.roleCode),
    cards,
  };

  if (hasPermission(user, "patient.view")) {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(patients).where(eq(patients.isActive, true));
    cards.push({ key: "patients", label: "Active patients", value: String(Number(row?.c ?? 0)), tone: "default" });
  }

  if (hasPermission(user, "appointment.view")) {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(appointments)
      .where(and(gte(appointments.scheduledAt, start), lte(appointments.scheduledAt, end), sql`${appointments.status} <> 'cancelled'`));
    cards.push({ key: "appointments", label: "Appointments today", value: String(Number(row?.c ?? 0)), tone: "default" });
  }

  // Doctor view: only the signed-in doctor's own queue and drafts.
  if (user.roleCode === "doctor" || hasPermission(user, "consultation.finalize")) {
    const doctor = (await db.select().from(doctors).where(eq(doctors.userId, user.id)).limit(1))[0];
    const queue = doctor
      ? await db
          .select({
            queueId: queues.id,
            tokenNumber: queues.tokenNumber,
            status: queues.status,
            appointmentId: queues.appointmentId,
            patientId: patients.id,
            patientName: patientFullName,
            patientMrn: patients.mrn,
          })
          .from(queues)
          .innerJoin(patients, eq(queues.patientId, patients.id))
          .where(and(eq(queues.doctorId, doctor.id), eq(queues.queueDate, isoDate), sql`${queues.status} <> 'done'`))
          .orderBy(queues.tokenNumber)
      : [];
    const drafts = doctor
      ? await db
          .select({ id: encounters.id, patientName: patientFullName, startedAt: encounters.startedAt })
          .from(encounters)
          .innerJoin(patients, eq(encounters.patientId, patients.id))
          .where(and(eq(encounters.doctorId, doctor.id), eq(encounters.status, "draft")))
          .orderBy(encounters.startedAt)
      : [];
    result.doctor = {
      doctorId: doctor?.id ?? null,
      queue: queue.map((q) => ({ ...q, tokenNumber: Number(q.tokenNumber) })),
      draftEncounters: drafts.map((d) => ({ id: d.id, patientName: d.patientName, startedAt: d.startedAt.toISOString() })),
    };
    cards.push({ key: "waiting", label: "Patients waiting for me", value: String(result.doctor.queue.length), tone: result.doctor.queue.length > 0 ? "warn" : "default" });
    cards.push({ key: "drafts", label: "Unfinalized encounters", value: String(drafts.length), tone: drafts.length > 0 ? "warn" : "default" });
  }

  if (hasPermission(user, "appointment.create") || hasPermission(user, "appointment.checkin")) {
    const today = await db
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        status: appointments.status,
        patientName: patientFullName,
        doctorName: users.fullName,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
      .innerJoin(users, eq(doctors.userId, users.id))
      .where(and(gte(appointments.scheduledAt, start), lte(appointments.scheduledAt, end)))
      .orderBy(appointments.scheduledAt)
      .limit(50);
    let unpaid = 0;
    if (hasPermission(user, "billing.view")) {
      const [row] = await db.select({ c: sql<number>`count(*)` }).from(invoices).where(sql`${invoices.status} in ('open','partial')`);
      unpaid = Number(row?.c ?? 0);
      cards.push({ key: "unpaid", label: "Invoices awaiting payment", value: String(unpaid), tone: unpaid > 0 ? "warn" : "default" });
    }
    result.reception = {
      today: today.map((t) => ({ ...t, scheduledAt: t.scheduledAt.toISOString() })),
      unpaidInvoices: unpaid,
    };
  }

  if (hasPermission(user, "inventory.view") || hasPermission(user, "pharmacy.batch.view")) {
    const lowStock = await db
      .select({
        medicine: medicines.name,
        batchNumber: medicineBatches.batchNumber,
        quantityOnHand: medicineBatches.quantityOnHand,
        reorderLevel: medicines.reorderLevel,
      })
      .from(medicineBatches)
      .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
      .where(and(eq(medicineBatches.isActive, true), sql`${medicineBatches.quantityOnHand} <= ${medicines.reorderLevel}`))
      .orderBy(medicineBatches.quantityOnHand)
      .limit(20);
    const expiring = await db
      .select({
        medicine: medicines.name,
        batchNumber: medicineBatches.batchNumber,
        quantityOnHand: medicineBatches.quantityOnHand,
        expiryDate: medicineBatches.expiryDate,
      })
      .from(medicineBatches)
      .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
      .where(and(eq(medicineBatches.isActive, true), sql`${medicineBatches.quantityOnHand} > 0`, sql`${medicineBatches.expiryDate} <= (current_date + interval '90 days')`))
      .orderBy(medicineBatches.expiryDate)
      .limit(20);
    result.pharmacy = { lowStock, expiring };
    cards.push({ key: "low_stock", label: "Batches at or below reorder level", value: String(lowStock.length), tone: lowStock.length > 0 ? "warn" : "default" });
    cards.push({ key: "expiring", label: "Batches expiring in 90 days", value: String(expiring.length), tone: expiring.length > 0 ? "danger" : "default" });
  }

  if (hasPermission(user, "pharmacy.sale.create")) {
    const [row] = await db
      .select({ c: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${invoices.totalCents}),0)` })
      .from(invoices)
      .where(and(eq(invoices.source, "pharmacy"), gte(invoices.createdAt, start), lte(invoices.createdAt, end), sql`${invoices.status} <> 'cancelled'`));
    cards.push({ key: "pharmacy_sales", label: "Pharmacy bills today", value: String(Number(row?.c ?? 0)), tone: "default", hint: formatCentsHint(Number(row?.total ?? 0)) });
  }

  if (hasPermission(user, "lab.order.view")) {
    const [toCollect] = await db.select({ c: sql<number>`count(*)` }).from(labOrders).where(eq(labOrders.status, "ordered"));
    const [processing] = await db.select({ c: sql<number>`count(*)` }).from(labOrders).where(sql`${labOrders.status} in ('sample_collected','processing')`);
    const [awaiting] = await db.select({ c: sql<number>`count(*)` }).from(labResults).where(eq(labResults.status, "entered"));
    const [completed] = await db
      .select({ c: sql<number>`count(*)` })
      .from(labResults)
      .where(and(eq(labResults.status, "verified"), gte(labResults.verifiedAt, start), lte(labResults.verifiedAt, end)));
    result.lab = {
      toCollect: Number(toCollect?.c ?? 0),
      processing: Number(processing?.c ?? 0),
      awaitingVerification: Number(awaiting?.c ?? 0),
      completedToday: Number(completed?.c ?? 0),
    };
    if (hasPermission(user, "lab.sample.collect")) {
      cards.push({ key: "lab_collect", label: "Samples to collect", value: String(result.lab.toCollect), tone: result.lab.toCollect > 0 ? "warn" : "default" });
    }
    if (hasPermission(user, "lab.result.enter")) {
      cards.push({ key: "lab_processing", label: "Samples in processing", value: String(result.lab.processing), tone: "default" });
    }
    if (hasPermission(user, "lab.result.verify")) {
      cards.push({ key: "lab_verify", label: "Results awaiting verification", value: String(result.lab.awaitingVerification), tone: result.lab.awaitingVerification > 0 ? "warn" : "default" });
    }
  }

  if (hasPermission(user, "reports.financial")) {
    const [collected] = await db
      .select({ c: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
      .from(payments)
      .where(and(gte(payments.receivedAt, start), lte(payments.receivedAt, end)));
    cards.push({ key: "collections", label: "Collections today", value: formatCentsHint(Number(collected?.c ?? 0)), tone: "default" });
  }

  if (hasPermission(user, "user.view")) {
    const [active] = await db.select({ c: sql<number>`count(*)` }).from(users).where(eq(users.isActive, true));
    const [disabled] = await db.select({ c: sql<number>`count(*)` }).from(users).where(eq(users.isActive, false));
    cards.push({ key: "staff", label: "Active staff accounts", value: String(Number(active?.c ?? 0)), tone: "default", hint: `${Number(disabled?.c ?? 0)} disabled` });
  }

  if (hasPermission(user, "audit.view")) {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(auditLogs)
      .where(and(gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end), eq(auditLogs.result, "failure")));
    const failures = Number(row?.c ?? 0);
    cards.push({ key: "audit_failures", label: "Failed actions today", value: String(failures), tone: failures > 0 ? "danger" : "default" });
  }

  return result;
}

function headlineFor(roleCode: string): string {
  switch (roleCode) {
    case "doctor":
      return "Your consultation queue and unfinished records";
    case "nurse":
      return "Patients to prepare and samples to collect";
    case "receptionist":
      return "Today's appointments, check-in and payments";
    case "pharmacist":
      return "Dispensing, stock alerts and today's bills";
    case "store_manager":
      return "Purchases, batches and stock health";
    case "lab_technician":
      return "Samples in processing and result entry";
    case "lab_attendant":
      return "Samples waiting for collection";
    case "lab_verifier":
      return "Results awaiting your verification";
    case "accountant":
      return "Billing, collections and refunds";
    case "security_officer":
      return "Audit trail and system status";
    default:
      return "Hospital-wide operational status";
  }
}

function formatCentsHint(cents: number): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const frac = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}₹${whole.toLocaleString("en-IN")}.${frac}`;
}

export async function labWorklist(user: SessionUser) {
  const db = getDb();
  const rows = await db
    .select({
      orderId: labOrders.id,
      orderNo: labOrders.orderNo,
      orderStatus: labOrders.status,
      priority: labOrders.priority,
      createdAt: labOrders.createdAt,
      patientId: patients.id,
      patientName: patientFullName,
      patientMrn: patients.mrn,
    })
    .from(labOrders)
    .innerJoin(patients, eq(labOrders.patientId, patients.id))
    .where(sql`${labOrders.status} <> 'cancelled'`)
    .orderBy(labOrders.createdAt)
    .limit(100);

  const itemRows = rows.length
    ? await db
        .select({
          orderId: labOrderItems.orderId,
          itemId: labOrderItems.id,
          itemStatus: labOrderItems.status,
          resultId: labResults.id,
          resultStatus: labResults.status,
          resultValue: labResults.value,
          enteredBy: labResults.enteredBy,
        })
        .from(labOrderItems)
        .leftJoin(labResults, eq(labResults.orderItemId, labOrderItems.id))
    : [];

  return rows.map((order) => {
    const items = itemRows.filter((i) => i.orderId === order.orderId);
    return {
      ...order,
      createdAt: order.createdAt.toISOString(),
      itemCount: items.length,
      entered: items.filter((i) => i.resultStatus === "entered").length,
      verified: items.filter((i) => i.resultStatus === "verified").length,
      canVerifyAny: hasPermission(user, "lab.result.verify") && items.some((i) => i.resultStatus === "entered" && i.enteredBy !== user.id),
    };
  });
}
