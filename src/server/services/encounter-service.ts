import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  appointments,
  diagnoses,
  encounters,
  patients,
  prescriptionItems,
  prescriptions,
  queues,
  vitals,
} from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, notFound } from "../errors";
import type { AuthContext } from "../auth/session";
import { nextFormattedNumber } from "../sequences";

const draftSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  visitType: z.enum(["consultation", "follow_up", "procedure"]).optional(),
  chiefComplaint: z.string().max(1000).optional(),
  symptoms: z.string().max(4000).optional(),
  examination: z.string().max(4000).optional(),
  treatmentPlan: z.string().max(4000).optional(),
  followUpNotes: z.string().max(2000).optional(),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  diagnoses: z.array(z.object({
    code: z.string().max(20).optional(),
    description: z.string().min(1).max(300),
    type: z.enum(["primary", "secondary"]).optional(),
  })).optional(),
});

function assertDraft(status: string) {
  if (status === "finalized") throw badRequest("Finalized encounters cannot be edited");
}

export async function startEncounter(ctx: AuthContext, input: unknown) {
  const parsed = draftSchema.parse(input);
  const db = getDb();
  const [row] = await db.insert(encounters).values({
    appointmentId: parsed.appointmentId ?? null,
    patientId: parsed.patientId,
    doctorId: parsed.doctorId,
    visitType: parsed.visitType ?? "consultation",
    chiefComplaint: parsed.chiefComplaint ?? null,
    status: "draft",
  }).returning();
  if (parsed.appointmentId) {
    await db.update(appointments).set({ status: "in_consult", updatedAt: new Date() }).where(eq(appointments.id, parsed.appointmentId));
  }
  await writeAudit({ ctx, action: "create", module: "consultation", entity: "encounter", entityId: row.id, result: "success" });
  return row;
}

export async function updateEncounter(ctx: AuthContext, id: string, input: unknown) {
  const parsed = draftSchema.partial().parse(input);
  const db = getDb();
  const existing = (await db.select().from(encounters).where(eq(encounters.id, id)).limit(1))[0];
  if (!existing) throw notFound("Encounter not found");
  assertDraft(existing.status);
  await db.update(encounters).set({
    chiefComplaint: parsed.chiefComplaint ?? existing.chiefComplaint,
    symptoms: parsed.symptoms ?? existing.symptoms,
    examination: parsed.examination ?? existing.examination,
    treatmentPlan: parsed.treatmentPlan ?? existing.treatmentPlan,
    followUpNotes: parsed.followUpNotes ?? existing.followUpNotes,
    followUpOn: parsed.followUpOn === undefined ? existing.followUpOn : parsed.followUpOn,
    version: existing.version + 1,
    updatedAt: new Date(),
  }).where(eq(encounters.id, id));
  if (parsed.diagnoses) {
    await db.delete(diagnoses).where(eq(diagnoses.encounterId, id));
    if (parsed.diagnoses.length) {
      await db.insert(diagnoses).values(parsed.diagnoses.map((d) => ({
        encounterId: id,
        code: d.code ?? null,
        description: d.description,
        type: d.type ?? "primary",
      })));
    }
  }
  await writeAudit({ ctx, action: "update", module: "consultation", entity: "encounter", entityId: id, result: "success" });
  return getEncounter(id);
}

export async function recordVitals(ctx: AuthContext, input: {
  encounterId: string;
  patientId: string;
  temperatureC?: string;
  pulseBpm?: number;
  respiratoryRate?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  spo2?: number;
  weightKg?: string;
  heightCm?: string;
  notes?: string;
}) {
  const db = getDb();
  const enc = (await db.select().from(encounters).where(eq(encounters.id, input.encounterId)).limit(1))[0];
  if (!enc) throw notFound("Encounter not found");
  assertDraft(enc.status);
  const [row] = await db.insert(vitals).values({
    encounterId: input.encounterId,
    patientId: input.patientId,
    recordedBy: ctx.user.id,
    temperatureC: input.temperatureC ?? null,
    pulseBpm: input.pulseBpm ?? null,
    respiratoryRate: input.respiratoryRate ?? null,
    systolicMmHg: input.systolicMmHg ?? null,
    diastolicMmHg: input.diastolicMmHg ?? null,
    spo2: input.spo2 ?? null,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    notes: input.notes ?? null,
  }).returning();
  await writeAudit({ ctx, action: "record_vitals", module: "consultation", entity: "vitals", entityId: row.id, result: "success" });
  return row;
}

export async function addPrescription(ctx: AuthContext, input: {
  encounterId: string;
  notes?: string;
  items: { medicineName: string; medicineId?: string; dosage: string; frequency: string; duration: string; route?: string; quantity?: number; instructions?: string }[];
}) {
  if (!input.items.length) throw badRequest("Prescription requires items");
  const db = getDb();
  const enc = (await db.select().from(encounters).where(eq(encounters.id, input.encounterId)).limit(1))[0];
  if (!enc) throw notFound();
  assertDraft(enc.status);
  return db.transaction(async (tx) => {
    const prescriptionNo = await nextFormattedNumber(tx, "prescription");
    const [rx] = await tx.insert(prescriptions).values({
      prescriptionNo,
      encounterId: enc.id,
      patientId: enc.patientId,
      doctorId: enc.doctorId,
      notes: input.notes ?? null,
    }).returning();
    await tx.insert(prescriptionItems).values(input.items.map((i) => ({
      prescriptionId: rx.id,
      medicineName: i.medicineName,
      medicineId: i.medicineId ?? null,
      dosage: i.dosage,
      frequency: i.frequency,
      duration: i.duration,
      route: i.route ?? "oral",
      quantity: i.quantity ?? 1,
      instructions: i.instructions ?? null,
    })));
    await writeAudit({ ctx, action: "create", module: "prescription", entity: "prescription", entityId: rx.id, result: "success" });
    return rx;
  });
}

export async function finalizeEncounter(ctx: AuthContext, id: string) {
  const db = getDb();
  const existing = (await db.select().from(encounters).where(eq(encounters.id, id)).limit(1))[0];
  if (!existing) throw notFound();
  assertDraft(existing.status);
  const [row] = await db.update(encounters).set({
    status: "finalized",
    finalizedAt: new Date(),
    finalizedBy: ctx.user.id,
    updatedAt: new Date(),
    version: existing.version + 1,
  }).where(eq(encounters.id, id)).returning();
  if (existing.appointmentId) {
    await db.update(appointments).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(appointments.id, existing.appointmentId));
    await db.update(queues).set({ status: "done", updatedAt: new Date() }).where(eq(queues.appointmentId, existing.appointmentId));
  }
  await writeAudit({ ctx, action: "finalize", module: "consultation", entity: "encounter", entityId: id, result: "success" });
  return row;
}

export async function getEncounter(id: string) {
  const db = getDb();
  const enc = (await db.select().from(encounters).where(eq(encounters.id, id)).limit(1))[0];
  if (!enc) throw notFound();
  const v = await db.select().from(vitals).where(eq(vitals.encounterId, id)).orderBy(desc(vitals.recordedAt));
  const d = await db.select().from(diagnoses).where(eq(diagnoses.encounterId, id));
  const rx = await db.select().from(prescriptions).where(eq(prescriptions.encounterId, id));
  const items = rx.length
    ? await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx[0].id))
    : [];
  return { encounter: enc, vitals: v, diagnoses: d, prescriptions: rx, prescriptionItems: items };
}

export async function patientTimeline(patientId: string) {
  const db = getDb();
  const patient = (await db.select().from(patients).where(eq(patients.id, patientId)).limit(1))[0];
  if (!patient) throw notFound();
  const encs = await db.select().from(encounters).where(eq(encounters.patientId, patientId)).orderBy(desc(encounters.startedAt));
  const appts = await db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.scheduledAt));
  const rxs = await db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.createdAt));
  return { patient, encounters: encs, appointments: appts, prescriptions: rxs };
}
