import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { patientContacts, patients } from "@/db/schema";
import { writeAudit } from "../audit";
import { notFound } from "../errors";
import type { AuthContext } from "../auth/session";
import { nextFormattedNumber } from "../sequences";

const patientSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  sex: z.enum(["male", "female", "other", "unknown"]),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (y < 1900 || y > new Date().getUTCFullYear()) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Date of birth is not a real calendar date"),
  bloodGroup: z.string().max(8).optional().nullable(),
  nationalId: z.string().max(40).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  allergies: z.string().max(1000).optional().nullable(),
  emergencyName: z.string().max(120).optional().nullable(),
  emergencyPhone: z.string().max(20).optional().nullable(),
  emergencyRelation: z.string().max(40).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

export async function registerPatient(ctx: AuthContext, input: unknown) {
  const parsed = patientSchema.parse(input);
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const mrn = await nextFormattedNumber(tx, "patient_mrn");
    const [row] = await tx.insert(patients).values({
      mrn,
      firstName: parsed.firstName.trim(),
      lastName: parsed.lastName.trim(),
      sex: parsed.sex,
      dateOfBirth: parsed.dateOfBirth,
      bloodGroup: parsed.bloodGroup ?? null,
      nationalId: parsed.nationalId ?? null,
      address: parsed.address ?? null,
      city: parsed.city ?? null,
      notes: parsed.notes ?? null,
      allergies: parsed.allergies ?? null,
      emergencyName: parsed.emergencyName ?? null,
      emergencyPhone: parsed.emergencyPhone ?? null,
      emergencyRelation: parsed.emergencyRelation ?? null,
      registeredBy: ctx.user.id,
    }).returning();
    if (parsed.phone) {
      await tx.insert(patientContacts).values({
        patientId: row.id,
        type: "phone",
        value: parsed.phone,
        isPrimary: true,
      });
    }
    if (parsed.email) {
      await tx.insert(patientContacts).values({
        patientId: row.id,
        type: "email",
        value: parsed.email,
        isPrimary: !parsed.phone,
      });
    }
    return row;
  });
  await writeAudit({ ctx, action: "create", module: "patient", entity: "patient", entityId: created.id, newValue: { mrn: created.mrn }, result: "success" });
  return created;
}

export async function updatePatient(ctx: AuthContext, id: string, input: unknown) {
  const parsed = patientSchema.partial().parse(input);
  const db = getDb();
  const existing = (await db.select().from(patients).where(eq(patients.id, id)).limit(1))[0];
  if (!existing) throw notFound("Patient not found");
  const [updated] = await db.update(patients).set({
    firstName: parsed.firstName ?? existing.firstName,
    lastName: parsed.lastName ?? existing.lastName,
    sex: parsed.sex ?? existing.sex,
    dateOfBirth: parsed.dateOfBirth ?? existing.dateOfBirth,
    bloodGroup: parsed.bloodGroup === undefined ? existing.bloodGroup : parsed.bloodGroup,
    nationalId: parsed.nationalId === undefined ? existing.nationalId : parsed.nationalId,
    address: parsed.address === undefined ? existing.address : parsed.address,
    city: parsed.city === undefined ? existing.city : parsed.city,
    notes: parsed.notes === undefined ? existing.notes : parsed.notes,
    allergies: parsed.allergies === undefined ? existing.allergies : parsed.allergies,
    emergencyName: parsed.emergencyName === undefined ? existing.emergencyName : parsed.emergencyName,
    emergencyPhone: parsed.emergencyPhone === undefined ? existing.emergencyPhone : parsed.emergencyPhone,
    emergencyRelation: parsed.emergencyRelation === undefined ? existing.emergencyRelation : parsed.emergencyRelation,
    updatedAt: new Date(),
  }).where(eq(patients.id, id)).returning();
  await writeAudit({ ctx, action: "update", module: "patient", entity: "patient", entityId: id, previousValue: existing, newValue: parsed, result: "success" });
  return updated;
}

export async function searchPatients(q: string, page = 1) {
  const db = getDb();
  const limit = 25;
  const term = q.trim();
  const where = term
    ? or(
        ilike(patients.mrn, `%${term}%`),
        ilike(patients.firstName, `%${term}%`),
        ilike(patients.lastName, `%${term}%`),
        ilike(patients.nationalId, `%${term}%`),
      )
    : and(eq(patients.isActive, true));
  const items = await db.select().from(patients).where(where).orderBy(desc(patients.createdAt)).limit(limit).offset((page - 1) * limit);
  return { items, page };
}

export async function getPatient(id: string) {
  const db = getDb();
  const patient = (await db.select().from(patients).where(eq(patients.id, id)).limit(1))[0];
  if (!patient) throw notFound("Patient not found");
  const contacts = await db.select().from(patientContacts).where(eq(patientContacts.patientId, id));
  return { ...patient, contacts };
}
