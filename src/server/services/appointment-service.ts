import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { appointments, doctorSchedules, doctors, patients, queues, users } from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import type { AuthContext } from "../auth/session";

const bookSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  scheduledAt: z.string().min(10),
  durationMinutes: z.number().int().min(5).max(180).optional(),
  reason: z.string().max(500).optional(),
  visitType: z.enum(["consultation", "follow_up", "procedure"]).optional(),
});

export async function bookAppointment(ctx: AuthContext, input: unknown) {
  const parsed = bookSchema.parse(input);
  const scheduledAt = new Date(parsed.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw badRequest("Invalid appointment time");
  const db = getDb();
  const doctor = (await db.select().from(doctors).where(eq(doctors.id, parsed.doctorId)).limit(1))[0];
  if (!doctor?.isActive) throw notFound("Doctor not found");
  const patient = (await db.select().from(patients).where(eq(patients.id, parsed.patientId)).limit(1))[0];
  if (!patient) throw notFound("Patient not found");

  const weekday = scheduledAt.getUTCDay();
  const schedules = await db.select().from(doctorSchedules).where(and(eq(doctorSchedules.doctorId, doctor.id), eq(doctorSchedules.weekday, weekday), eq(doctorSchedules.isActive, true)));
  if (schedules.length === 0) throw badRequest("Doctor is not scheduled on this day");
  const minutesOfDay = scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
  const withinShift = schedules.some((s) => minutesOfDay >= toMinutes(s.startTime) && minutesOfDay < toMinutes(s.endTime));
  if (!withinShift) throw badRequest("Time is outside the doctor's working hours");

  const overlap = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(
      eq(appointments.doctorId, doctor.id),
      eq(appointments.scheduledAt, scheduledAt),
      sql`${appointments.status} not in ('cancelled', 'no_show')`,
    ))
    .limit(1);
  if (overlap[0]) throw conflict("This slot is already booked");

  const [row] = await db.insert(appointments).values({
    patientId: patient.id,
    doctorId: doctor.id,
    scheduledAt,
    durationMinutes: parsed.durationMinutes ?? 15,
    reason: parsed.reason ?? null,
    visitType: parsed.visitType ?? "consultation",
    status: "scheduled",
    createdBy: ctx.user.id,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "appointment", entity: "appointment", entityId: row.id, result: "success" });
  return row;
}

export async function updateAppointmentStatus(ctx: AuthContext, id: string, status: string, reason?: string) {
  const allowed = ["scheduled", "cancelled", "no_show", "checked_in", "in_consult", "completed"];
  if (!allowed.includes(status)) throw badRequest("Invalid status");
  const db = getDb();
  const existing = (await db.select().from(appointments).where(eq(appointments.id, id)).limit(1))[0];
  if (!existing) throw notFound("Appointment not found");
  const patch: Partial<typeof appointments.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "cancelled") patch.cancelledReason = reason ?? "cancelled";
  if (status === "completed") patch.completedAt = new Date();
  const [row] = await db.update(appointments).set(patch).where(eq(appointments.id, id)).returning();
  await writeAudit({ ctx, action: status, module: "appointment", entity: "appointment", entityId: id, previousValue: { status: existing.status }, newValue: { status }, result: "success" });
  return row;
}

export async function rescheduleAppointment(ctx: AuthContext, id: string, scheduledAtIso: string) {
  const scheduledAt = new Date(scheduledAtIso);
  const db = getDb();
  const existing = (await db.select().from(appointments).where(eq(appointments.id, id)).limit(1))[0];
  if (!existing) throw notFound();
  if (["completed", "cancelled"].includes(existing.status)) throw badRequest("Cannot reschedule this appointment");
  const [row] = await db.update(appointments).set({ scheduledAt, status: "scheduled", updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
  await writeAudit({ ctx, action: "reschedule", module: "appointment", entity: "appointment", entityId: id, result: "success" });
  return row;
}

export async function checkIn(ctx: AuthContext, appointmentId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const appt = (await tx.select().from(appointments).where(eq(appointments.id, appointmentId)).for("update"))[0];
    if (!appt) throw notFound("Appointment not found");
    if (appt.status === "cancelled") throw badRequest("Appointment is cancelled");
    if (appt.status === "checked_in" || appt.status === "in_consult") {
      const existingQ = (await tx.select().from(queues).where(eq(queues.appointmentId, appt.id)).limit(1))[0];
      return { appointment: appt, queue: existingQ };
    }
    const queueDate = appt.scheduledAt.toISOString().slice(0, 10);
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${queues.tokenNumber}), 0)` })
      .from(queues)
      .where(and(eq(queues.doctorId, appt.doctorId), eq(queues.queueDate, queueDate)));
    const tokenNumber = Number(max) + 1;
    await tx.update(appointments).set({ status: "checked_in", checkedInAt: new Date(), updatedAt: new Date() }).where(eq(appointments.id, appt.id));
    const [queue] = await tx.insert(queues).values({
      doctorId: appt.doctorId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      queueDate,
      tokenNumber,
      status: "waiting",
    }).returning();
    await writeAudit({ ctx, action: "checkin", module: "appointment", entity: "appointment", entityId: appt.id, newValue: { tokenNumber }, result: "success" });
    return { appointment: appt, queue };
  });
}

export async function listAppointments(opts: { doctorId?: string; date?: string; patientId?: string }) {
  const db = getDb();
  const filters = [];
  if (opts.doctorId) filters.push(eq(appointments.doctorId, opts.doctorId));
  if (opts.patientId) filters.push(eq(appointments.patientId, opts.patientId));
  if (opts.date) {
    const start = new Date(`${opts.date}T00:00:00.000Z`);
    const end = new Date(`${opts.date}T23:59:59.999Z`);
    filters.push(gte(appointments.scheduledAt, start));
    filters.push(lte(appointments.scheduledAt, end));
  }
  const where = filters.length ? and(...filters) : undefined;
  return db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      status: appointments.status,
      visitType: appointments.visitType,
      reason: appointments.reason,
      patientId: patients.id,
      patientMrn: patients.mrn,
      patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
      doctorId: doctors.id,
      doctorName: users.fullName,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
    .innerJoin(users, eq(doctors.userId, users.id))
    .where(where)
    .orderBy(appointments.scheduledAt);
}

export async function listQueue(doctorId: string, date: string) {
  const db = getDb();
  return db
    .select({
      id: queues.id,
      tokenNumber: queues.tokenNumber,
      status: queues.status,
      appointmentId: queues.appointmentId,
      patientId: patients.id,
      patientMrn: patients.mrn,
      patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
    })
    .from(queues)
    .innerJoin(patients, eq(queues.patientId, patients.id))
    .where(and(eq(queues.doctorId, doctorId), eq(queues.queueDate, date)))
    .orderBy(queues.tokenNumber);
}

export async function setQueueStatus(ctx: AuthContext, queueId: string, status: "waiting" | "called" | "in_consult" | "done" | "skipped") {
  const db = getDb();
  const patch: Partial<typeof queues.$inferInsert> = { status, updatedAt: new Date() };
  if (status === "called") patch.calledAt = new Date();
  const [row] = await db.update(queues).set(patch).where(eq(queues.id, queueId)).returning();
  if (!row) throw notFound();
  if (status === "in_consult") {
    await db.update(appointments).set({ status: "in_consult", updatedAt: new Date() }).where(eq(appointments.id, row.appointmentId));
  }
  if (status === "done") {
    await db.update(appointments).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(appointments.id, row.appointmentId));
  }
  await writeAudit({ ctx, action: "queue_" + status, module: "appointment", entity: "queue", entityId: queueId, result: "success" });
  return row;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Appointment times are stored as UTC instants but treated as hospital wall-clock,
 * so a server running in the hospital timezone and the schedule table agree.
 */
export async function availableSlots(doctorId: string, date: string): Promise<{ startsAt: string; label: string; taken: boolean }[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("date must be YYYY-MM-DD");
  const db = getDb();
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(dayStart.getTime())) throw badRequest("Invalid date");
  const weekday = dayStart.getUTCDay();
  const schedules = await db
    .select()
    .from(doctorSchedules)
    .where(and(eq(doctorSchedules.doctorId, doctorId), eq(doctorSchedules.weekday, weekday), eq(doctorSchedules.isActive, true)))
    .orderBy(doctorSchedules.startTime);
  if (schedules.length === 0) return [];

  const booked = await db
    .select({ scheduledAt: appointments.scheduledAt })
    .from(appointments)
    .where(and(
      eq(appointments.doctorId, doctorId),
      gte(appointments.scheduledAt, dayStart),
      lte(appointments.scheduledAt, new Date(`${date}T23:59:59.999Z`)),
      sql`${appointments.status} not in ('cancelled', 'no_show')`,
    ));
  const takenSet = new Set(booked.map((b) => b.scheduledAt.toISOString()));

  const slots: { startsAt: string; label: string; taken: boolean }[] = [];
  for (const schedule of schedules) {
    const step = schedule.slotMinutes > 0 ? schedule.slotMinutes : 15;
    for (let m = toMinutes(schedule.startTime); m + step <= toMinutes(schedule.endTime); m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const startsAt = new Date(`${date}T${hh}:${mm}:00.000Z`).toISOString();
      slots.push({ startsAt, label: `${hh}:${mm}`, taken: takenSet.has(startsAt) });
    }
  }
  return slots;
}

export async function myDoctorProfile(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      fullName: users.fullName,
      specialization: doctors.specialization,
      consultationFeeCents: doctors.consultationFeeCents,
      followUpFeeCents: doctors.followUpFeeCents,
    })
    .from(doctors)
    .innerJoin(users, eq(doctors.userId, users.id))
    .where(eq(doctors.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSchedules(doctorId: string) {
  return getDb().select().from(doctorSchedules).where(eq(doctorSchedules.doctorId, doctorId)).orderBy(doctorSchedules.weekday, doctorSchedules.startTime);
}

export async function saveSchedules(ctx: AuthContext, doctorId: string, items: { weekday: number; startTime: string; endTime: string; slotMinutes: number }[]) {
  const db = getDb();
  await db.delete(doctorSchedules).where(eq(doctorSchedules.doctorId, doctorId));
  if (items.length) {
    await db.insert(doctorSchedules).values(items.map((i) => ({
      doctorId,
      weekday: i.weekday,
      startTime: i.startTime,
      endTime: i.endTime,
      slotMinutes: i.slotMinutes,
    })));
  }
  await writeAudit({ ctx, action: "update", module: "admin", entity: "doctor_schedule", entityId: doctorId, result: "success" });
  return listSchedules(doctorId);
}

export { desc };
