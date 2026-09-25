import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  appointments,
  diagnoses,
  doctors,
  encounters,
  labOrders,
  patients,
  prescriptionItems,
  prescriptions,
  queues,
  users,
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

const vitalsSchema = z.object({
  encounterId: z.string().uuid(),
  temperatureC: z.coerce.number().min(25).max(45).optional().nullable(),
  pulseBpm: z.coerce.number().int().min(20).max(250).optional().nullable(),
  respiratoryRate: z.coerce.number().int().min(4).max(80).optional().nullable(),
  systolicMmHg: z.coerce.number().int().min(50).max(300).optional().nullable(),
  diastolicMmHg: z.coerce.number().int().min(20).max(200).optional().nullable(),
  spo2: z.coerce.number().int().min(40).max(100).optional().nullable(),
  weightKg: z.coerce.number().min(0.5).max(400).optional().nullable(),
  heightCm: z.coerce.number().min(20).max(260).optional().nullable(),
  notes: z.string().max(1000).optional(),
});

export async function recordVitals(ctx: AuthContext, input: unknown) {
  const parsed = vitalsSchema.parse(input);
  const db = getDb();
  const enc = (await db.select().from(encounters).where(eq(encounters.id, parsed.encounterId)).limit(1))[0];
  if (!enc) throw notFound("Encounter not found");
  assertDraft(enc.status);
  if (parsed.systolicMmHg && parsed.diastolicMmHg && parsed.diastolicMmHg >= parsed.systolicMmHg) {
    throw badRequest("Diastolic pressure must be lower than systolic");
  }
  const [row] = await db.insert(vitals).values({
    encounterId: enc.id,
    patientId: enc.patientId,
    recordedBy: ctx.user.id,
    temperatureC: parsed.temperatureC != null ? String(parsed.temperatureC) : null,
    pulseBpm: parsed.pulseBpm ?? null,
    respiratoryRate: parsed.respiratoryRate ?? null,
    systolicMmHg: parsed.systolicMmHg ?? null,
    diastolicMmHg: parsed.diastolicMmHg ?? null,
    spo2: parsed.spo2 ?? null,
    weightKg: parsed.weightKg != null ? String(parsed.weightKg) : null,
    heightCm: parsed.heightCm != null ? String(parsed.heightCm) : null,
    notes: parsed.notes ?? null,
  }).returning();
  await writeAudit({ ctx, action: "record_vitals", module: "consultation", entity: "vitals", entityId: row.id, result: "success" });
  return row;
}

const prescriptionSchema = z.object({
  encounterId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    medicineName: z.string().min(1, "Medicine is required").max(160),
    medicineId: z.string().uuid().optional().nullable(),
    dosage: z.string().min(1, "Dosage is required").max(80),
    frequency: z.string().min(1, "Frequency is required").max(80),
    duration: z.string().min(1, "Duration is required").max(80),
    route: z.enum(["oral", "topical", "iv", "im", "sc", "inhalation", "rectal", "ophthalmic"]).optional(),
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
    instructions: z.string().max(300).optional(),
  })).min(1, "Prescription needs at least one medicine"),
});

export async function addPrescription(ctx: AuthContext, input: unknown) {
  const parsed = prescriptionSchema.parse(input);
  const db = getDb();
  const enc = (await db.select().from(encounters).where(eq(encounters.id, parsed.encounterId)).limit(1))[0];
  if (!enc) throw notFound("Encounter not found");
  assertDraft(enc.status);
  return db.transaction(async (tx) => {
    const prescriptionNo = await nextFormattedNumber(tx, "prescription");
    const [rx] = await tx.insert(prescriptions).values({
      prescriptionNo,
      encounterId: enc.id,
      patientId: enc.patientId,
      doctorId: enc.doctorId,
      notes: parsed.notes ?? null,
    }).returning();
    await tx.insert(prescriptionItems).values(parsed.items.map((i) => ({
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
  const rows = await db
    .select({
      encounter: encounters,
      patientMrn: patients.mrn,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientSex: patients.sex,
      patientDob: patients.dateOfBirth,
      patientAllergies: patients.allergies,
      doctorName: users.fullName,
      doctorSpecialization: doctors.specialization,
    })
    .from(encounters)
    .innerJoin(patients, eq(encounters.patientId, patients.id))
    .innerJoin(doctors, eq(encounters.doctorId, doctors.id))
    .innerJoin(users, eq(doctors.userId, users.id))
    .where(eq(encounters.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("Encounter not found");
  const v = await db.select().from(vitals).where(eq(vitals.encounterId, id)).orderBy(desc(vitals.recordedAt));
  const d = await db.select().from(diagnoses).where(eq(diagnoses.encounterId, id));
  const rx = await db.select().from(prescriptions).where(eq(prescriptions.encounterId, id)).orderBy(desc(prescriptions.createdAt));
  const items = rx.length
    ? await db.select().from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, rx.map((r) => r.id)))
    : [];
  const orders = await db.select().from(labOrders).where(eq(labOrders.encounterId, id)).orderBy(desc(labOrders.createdAt));
  return {
    encounter: row.encounter,
    patient: {
      mrn: row.patientMrn,
      fullName: `${row.patientFirstName} ${row.patientLastName}`,
      sex: row.patientSex,
      dateOfBirth: row.patientDob,
      allergies: row.patientAllergies,
    },
    doctor: { fullName: row.doctorName, specialization: row.doctorSpecialization },
    vitals: v,
    diagnoses: d,
    prescriptions: rx,
    prescriptionItems: items,
    labOrders: orders,
  };
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
