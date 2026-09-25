import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { medicineBatches, medicines, rolePermissions, roles, users } from "@/db/schema";
import { login } from "@/server/services/auth-service";
import { registerPatient } from "@/server/services/patient-service";
import { receivePurchase, sellMedicines } from "@/server/services/pharmacy-service";
import { createInvoice, recordPayment } from "@/server/services/billing-service";
import { loadSessionUser } from "@/server/auth/rbac";
import { assertPermission } from "@/server/auth/rbac";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/session";
import { suppliers } from "@/db/schema";
import { createLabOrder, enterResult, verifyResult } from "@/server/services/lab-service";
import { labTests } from "@/db/schema";
import { listDoctors } from "@/server/services/user-service";
import { bookAppointment, checkIn } from "@/server/services/appointment-service";
import { finalizeEncounter, startEncounter, updateEncounter } from "@/server/services/encounter-service";

async function ctxFor(username: string): Promise<AuthContext> {
  const db = getDb();
  const user = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  const sessionUser = await loadSessionUser(user.id);
  return { user: sessionUser, sessionId: "test", csrfToken: "csrf", ip: "127.0.0.1", userAgent: "vitest" };
}

describe("auth", () => {
  it("rejects invalid passwords with a generic error", async () => {
    await expect(login({ username: "admin", password: "wrong-password" }, { ip: "1.1.1.1", userAgent: "t" }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("logs in the bootstrap admin", async () => {
    const result = await login({ username: "admin", password: "ChangeMe_Admin_1" }, { ip: "127.0.0.1", userAgent: "t" });
    expect(result.user.roleCode).toBe("super_admin");
    expect(result.token.length).toBeGreaterThan(20);
  });
});

describe("authorization", () => {
  it("forbids pharmacists from refunds", async () => {
    const ctx = await ctxFor("pharmacist");
    expect(() => assertPermission(ctx.user, "billing.refund")).toThrow(AppError);
  });

  it("allows accountants to refund", async () => {
    const ctx = await ctxFor("accountant");
    expect(() => assertPermission(ctx.user, "billing.refund")).not.toThrow();
  });
});

describe("clinical + pharmacy + billing workflows", () => {
  it("registers a patient, books, consults, and bills", async () => {
    const reception = await ctxFor("receptionist");
    const doctorUser = await ctxFor("doctor");
    const patient = await registerPatient(reception, {
      firstName: "Anita",
      lastName: "Nair",
      sex: "female",
      dateOfBirth: "1988-04-12",
      phone: "9999999999",
    });
    expect(patient.mrn).toMatch(/^MRN/);
    await expect(registerPatient(reception, {
      firstName: "Bad",
      lastName: "Date",
      sex: "female",
      dateOfBirth: "12/09/20514",
    })).rejects.toBeTruthy();
    const docs = await listDoctors();
    const doc = docs[0];
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + ((1 + 7 - scheduledAt.getDay()) % 7 || 7));
    scheduledAt.setHours(10, 0, 0, 0);
    const appt = await bookAppointment(reception, {
      patientId: patient.id,
      doctorId: doc.id,
      scheduledAt: scheduledAt.toISOString(),
      reason: "Fever",
    });
    const checked = await checkIn(reception, appt.id);
    expect(checked.queue.tokenNumber).toBeGreaterThan(0);
    const enc = await startEncounter(doctorUser, {
      appointmentId: appt.id,
      patientId: patient.id,
      doctorId: doc.id,
      chiefComplaint: "Fever",
    });
    await updateEncounter(doctorUser, enc.id, { symptoms: "High temperature", diagnoses: [{ description: "Viral fever" }] });
    const fin = await finalizeEncounter(doctorUser, enc.id);
    expect(fin.status).toBe("finalized");
    await expect(updateEncounter(doctorUser, enc.id, { symptoms: "tamper" })).rejects.toMatchObject({ status: 400 });

    const invoice = await createInvoice(reception, {
      patientId: patient.id,
      encounterId: enc.id,
      source: "consultation",
      items: [{ itemType: "consultation", description: "Consultation", quantity: 1, unitPriceCents: 40000 }],
    });
    expect(invoice.invoiceNo).toMatch(/^INV/);
    const pay = await recordPayment(reception, { invoiceId: invoice.id, method: "cash", amountCents: 20000 });
    expect(pay.amountCents).toBe(20000);
    const pay2 = await recordPayment(reception, { invoiceId: invoice.id, method: "upi", amountCents: 20000 });
    expect(pay2.amountCents).toBe(20000);
  });

  it("prevents concurrent sales from driving stock negative", async () => {
    const store = await ctxFor("store");
    const pharm = await ctxFor("pharmacist");
    const db = getDb();
    const med = (await db.select().from(medicines).limit(1))[0];
    const supplier = (await db.select().from(suppliers).limit(1))[0];
    const purchase = await receivePurchase(store, {
      supplierId: supplier.id,
      purchasedAt: new Date().toISOString().slice(0, 10),
      items: [{
        medicineId: med.id,
        batchNumber: "CONCUR-1",
        expiryDate: "2030-01-01",
        quantity: 5,
        purchaseRateCents: 100,
        mrpCents: 200,
        unitPriceCents: 150,
        gstBps: 0,
      }],
    });
    expect(purchase.totalCents).toBeGreaterThan(0);
    const batch = (await db.select().from(medicineBatches).where(eq(medicineBatches.batchNumber, "CONCUR-1")))[0];
    const attempts = Array.from({ length: 8 }, () =>
      sellMedicines(pharm, { items: [{ batchId: batch.id, quantity: 1 }] }),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(ok).toBe(5);
    expect(failed).toBe(3);
    const after = (await db.select().from(medicineBatches).where(eq(medicineBatches.id, batch.id)))[0];
    expect(after.quantityOnHand).toBe(0);
  });

  it("issues unique invoice numbers under parallel billing", async () => {
    const acc = await ctxFor("accountant");
    const created = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      createInvoice(acc, {
        source: "service",
        items: [{ itemType: "service", description: `Parallel ${i}`, quantity: 1, unitPriceCents: 1000 }],
      }),
    ));
    const nos = created.map((c) => c.invoiceNo);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it("blocks the entering technician from verifying their own lab result", async () => {
    const reception = await ctxFor("receptionist");
    const tech = await ctxFor("labtech");
    const patient = await registerPatient(reception, {
      firstName: "Lab",
      lastName: "Subject",
      sex: "male",
      dateOfBirth: "1991-01-01",
    });
    const test = (await getDb().select().from(labTests).limit(1))[0];
    const order = await createLabOrder(await ctxFor("doctor"), { patientId: patient.id, testIds: [test.id], bill: false });
    const itemId = order.items[0].id;
    const result = await enterResult(tech, itemId, "12.4");
    await expect(verifyResult(tech, result.id)).rejects.toMatchObject({ status: 400 });
    const verifier = await ctxFor("labver");
    const verified = await verifyResult(verifier, result.id);
    expect(verified.status).toBe("verified");
  });
});
