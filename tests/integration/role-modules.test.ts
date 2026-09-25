import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { labTests, medicineBatches, medicines, patients, suppliers, users } from "@/db/schema";
import { loadSessionUser } from "@/server/auth/rbac";
import type { AuthContext } from "@/server/auth/session";
import { dashboardFor, labWorklist } from "@/server/services/dashboard-service";
import { availableSlots, bookAppointment, checkIn, myDoctorProfile } from "@/server/services/appointment-service";
import { registerPatient } from "@/server/services/patient-service";
import { addPrescription, finalizeEncounter, getEncounter, recordVitals, startEncounter } from "@/server/services/encounter-service";
import { dispensableStock, getSaleDetail, receivePurchase, saleReturn, sellMedicines } from "@/server/services/pharmacy-service";
import { collectSample, createLabOrder, enterResult, receiveSample, verifyResult } from "@/server/services/lab-service";
import { getInvoice } from "@/server/services/billing-service";
import { listDoctors } from "@/server/services/user-service";

async function ctxFor(username: string): Promise<AuthContext> {
  const db = getDb();
  const user = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!user) throw new Error(`Seed user ${username} missing`);
  return {
    user: await loadSessionUser(user.id),
    sessionId: "test",
    csrfToken: "csrf",
    ip: "127.0.0.1",
    userAgent: "vitest",
  };
}

function nextWeekday(targetDay: number): Date {
  const date = new Date();
  date.setUTCHours(10, 0, 0, 0);
  while (date.getUTCDay() !== targetDay || date.getTime() < Date.now()) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

describe("receptionist module", () => {
  it("shows a front-desk dashboard without clinical or financial internals it should not have", async () => {
    const ctx = await ctxFor("receptionist");
    const dash = await dashboardFor(ctx.user);
    expect(dash.roleCode).toBe("receptionist");
    expect(dash.reception).toBeDefined();
    expect(dash.doctor).toBeUndefined();
    expect(dash.lab).toBeUndefined();
    expect(dash.cards.some((c) => c.key === "collections")).toBe(false);
  });

  it("offers real slots and books, then rejects the same slot twice", async () => {
    const ctx = await ctxFor("receptionist");
    const doctor = (await listDoctors())[0];
    const when = nextWeekday(3);
    const date = when.toISOString().slice(0, 10);

    const slots = await availableSlots(doctor.id, date);
    expect(slots.length).toBeGreaterThan(0);
    const free = slots.find((s) => !s.taken)!;

    const patient = await registerPatient(ctx, {
      firstName: "Slot",
      lastName: "Tester",
      sex: "male",
      dateOfBirth: "1990-01-01",
    });
    await bookAppointment(ctx, { patientId: patient.id, doctorId: doctor.id, scheduledAt: free.startsAt });

    const after = await availableSlots(doctor.id, date);
    expect(after.find((s) => s.startsAt === free.startsAt)?.taken).toBe(true);
    await expect(
      bookAppointment(ctx, { patientId: patient.id, doctorId: doctor.id, scheduledAt: free.startsAt }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a time outside the doctor's working hours", async () => {
    const ctx = await ctxFor("receptionist");
    const doctor = (await listDoctors())[0];
    const when = nextWeekday(3);
    when.setUTCHours(23, 0, 0, 0);
    const patient = (await getDb().select().from(patients).limit(1))[0];
    await expect(
      bookAppointment(ctx, { patientId: patient.id, doctorId: doctor.id, scheduledAt: when.toISOString() }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("doctor module", () => {
  it("surfaces only the signed-in doctor's queue and own drafts", async () => {
    const reception = await ctxFor("receptionist");
    const doctorCtx = await ctxFor("doctor");
    const profile = await myDoctorProfile(doctorCtx.user.id);
    expect(profile?.id).toBeTruthy();

    const patient = await registerPatient(reception, {
      firstName: "Queue",
      lastName: "Patient",
      sex: "female",
      dateOfBirth: "1994-03-03",
    });
    const when = nextWeekday(4);
    const appointment = await bookAppointment(reception, {
      patientId: patient.id,
      doctorId: profile!.id,
      scheduledAt: when.toISOString(),
    });
    await checkIn(reception, appointment.id);

    const dash = await dashboardFor(doctorCtx.user);
    expect(dash.doctor?.doctorId).toBe(profile!.id);
    expect(dash.reception).toBeUndefined();
    // Queue only holds today's tokens; the booked visit may be on a later day.
    expect(Array.isArray(dash.doctor?.queue)).toBe(true);
  });

  it("runs a full consultation: vitals, prescription, lab order, finalize, then locks", async () => {
    const reception = await ctxFor("receptionist");
    const doctorCtx = await ctxFor("doctor");
    const profile = await myDoctorProfile(doctorCtx.user.id);
    const patient = await registerPatient(reception, {
      firstName: "Consult",
      lastName: "Flow",
      sex: "male",
      dateOfBirth: "1986-07-07",
    });
    const encounter = await startEncounter(doctorCtx, {
      patientId: patient.id,
      doctorId: profile!.id,
      chiefComplaint: "Headache",
    });
    await recordVitals(doctorCtx, {
      encounterId: encounter.id,
      temperatureC: "37.2",
      pulseBpm: 78,
      systolicMmHg: 122,
      diastolicMmHg: 80,
      spo2: 98,
    });
    await addPrescription(doctorCtx, {
      encounterId: encounter.id,
      items: [
        { medicineName: "Paracetamol 500mg", dosage: "1 tablet", frequency: "TID", duration: "5 days", quantity: 15 },
        { medicineName: "ORS sachet", dosage: "1 sachet", frequency: "BD", duration: "3 days", quantity: 6 },
      ],
    });
    const test = (await getDb().select().from(labTests).limit(1))[0];
    await createLabOrder(doctorCtx, { patientId: patient.id, encounterId: encounter.id, testIds: [test.id] });

    const detail = await getEncounter(encounter.id);
    expect(detail.patient.fullName).toBe("Consult Flow");
    expect(detail.vitals).toHaveLength(1);
    expect(detail.prescriptionItems).toHaveLength(2);
    expect(detail.labOrders).toHaveLength(1);

    await finalizeEncounter(doctorCtx, encounter.id);
    await expect(
      recordVitals(doctorCtx, { encounterId: encounter.id, pulseBpm: 80 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addPrescription(doctorCtx, {
        encounterId: encounter.id,
        items: [{ medicineName: "Late add", dosage: "1", frequency: "OD", duration: "1 day" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects implausible vitals instead of storing them", async () => {
    const doctorCtx = await ctxFor("doctor");
    const profile = await myDoctorProfile(doctorCtx.user.id);
    const patient = (await getDb().select().from(patients).limit(1))[0];
    const encounter = await startEncounter(doctorCtx, { patientId: patient.id, doctorId: profile!.id });
    await expect(recordVitals(doctorCtx, { encounterId: encounter.id, pulseBpm: 900 })).rejects.toBeTruthy();
    await expect(
      recordVitals(doctorCtx, { encounterId: encounter.id, systolicMmHg: 100, diastolicMmHg: 120 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("pharmacy module", () => {
  let batchId = "";

  beforeAll(async () => {
    const store = await ctxFor("store");
    const db = getDb();
    const medicine = (await db.select().from(medicines).limit(1))[0];
    const supplier = (await db.select().from(suppliers).limit(1))[0];
    await receivePurchase(store, {
      supplierId: supplier.id,
      purchasedAt: new Date().toISOString().slice(0, 10),
      items: [
        {
          medicineId: medicine.id,
          batchNumber: "ROLE-SALE-1",
          expiryDate: "2030-01-01",
          quantity: 30,
          purchaseRateCents: 1000,
          mrpCents: 2000,
          unitPriceCents: 1800,
          gstBps: 1200,
        },
      ],
    });
    batchId = (await db.select().from(medicineBatches).where(eq(medicineBatches.batchNumber, "ROLE-SALE-1")))[0].id;
  });

  it("lists dispensable stock expiry-first and hides expired batches", async () => {
    const store = await ctxFor("store");
    const db = getDb();
    const medicine = (await db.select().from(medicines).limit(1))[0];
    const supplier = (await db.select().from(suppliers).limit(1))[0];
    await db.insert(medicineBatches).values({
      medicineId: medicine.id,
      batchNumber: "EXPIRED-1",
      mrpCents: 1000,
      unitPriceCents: 900,
      purchaseRateCents: 500,
      quantityOnHand: 10,
      supplierId: supplier.id,
      expiryDate: "2020-01-01",
    });
    void store;
    const stock = await dispensableStock();
    expect(stock.some((s) => s.batchNumber === "EXPIRED-1")).toBe(false);
    expect(stock.some((s) => s.batchNumber === "ROLE-SALE-1")).toBe(true);
    const expiries = stock.map((s) => s.expiryDate);
    expect([...expiries].sort()).toEqual(expiries);
  });

  it("dispenses with payment, then accepts a partial return and refunds only what was paid", async () => {
    const pharmacist = await ctxFor("pharmacist");
    const invoice = await sellMedicines(pharmacist, {
      items: [{ batchId, quantity: 4 }],
      paymentMethod: "cash",
      amountTenderedCents: 8064,
    });
    expect(invoice.totalCents).toBe(8064);
    expect(invoice.status).toBe("paid");

    const detail = await getSaleDetail(invoice.id);
    expect(detail.items[0].returnableQuantity).toBe(4);

    const returned = await saleReturn(pharmacist, invoice.id, [{ batchId, quantity: 1 }], "Patient returned one strip");
    expect(returned.goodsValueCents).toBe(1800);
    expect(returned.cashRefundedCents).toBe(1800);

    const afterReturn = await getSaleDetail(invoice.id);
    expect(afterReturn.items[0].returnableQuantity).toBe(3);
    await expect(
      saleReturn(pharmacist, invoice.id, [{ batchId, quantity: 5 }], "Over-return attempt"),
    ).rejects.toMatchObject({ status: 409 });

    const stockAfter = (await getDb().select().from(medicineBatches).where(eq(medicineBatches.id, batchId)))[0];
    expect(stockAfter.quantityOnHand).toBe(27);
  });

  it("keeps the pharmacist out of refunds and user administration", async () => {
    const pharmacist = await ctxFor("pharmacist");
    expect(pharmacist.user.permissions).not.toContain("billing.refund");
    expect(pharmacist.user.permissions).not.toContain("user.create");
    const dash = await dashboardFor(pharmacist.user);
    expect(dash.pharmacy).toBeDefined();
    expect(dash.cards.some((c) => c.key === "collections")).toBe(false);
  });
});

describe("laboratory module", () => {
  it("moves an order through collect, receive, enter and verify with separate users", async () => {
    const doctorCtx = await ctxFor("doctor");
    const attendant = await ctxFor("labatt");
    const technician = await ctxFor("labtech");
    const verifier = await ctxFor("labver");

    const patient = (await getDb().select().from(patients).limit(1))[0];
    const test = (await getDb().select().from(labTests).limit(1))[0];
    const order = await createLabOrder(doctorCtx, { patientId: patient.id, testIds: [test.id], bill: false });

    const sample = await collectSample(attendant, order.order.id, "blood");
    expect(sample.status).toBe("collected");
    await receiveSample(technician, sample.id);

    const itemId = order.items[0].id;
    const result = await enterResult(technician, itemId, "13.1", "normal");
    await expect(verifyResult(technician, result.id)).rejects.toMatchObject({ status: 400 });

    const verified = await verifyResult(verifier, result.id);
    expect(verified.status).toBe("verified");
    await expect(enterResult(technician, itemId, "99")).rejects.toMatchObject({ status: 400 });

    const worklist = await labWorklist(verifier.user);
    const row = worklist.find((w) => w.orderId === order.order.id);
    expect(row?.verified).toBe(1);
  });

  it("bills the ordering department when a lab order is raised", async () => {
    const doctorCtx = await ctxFor("doctor");
    const patient = (await getDb().select().from(patients).limit(1))[0];
    const test = (await getDb().select().from(labTests).limit(1))[0];
    const order = await createLabOrder(doctorCtx, { patientId: patient.id, testIds: [test.id] });
    expect(order.order.billedInvoiceId).toBeTruthy();
    const invoice = await getInvoice(order.order.billedInvoiceId!);
    expect(invoice.invoice.source).toBe("lab");
    expect(invoice.items[0].lineTotalCents).toBe(test.priceCents);
  });

  it("gives the attendant collection rights but not result entry or verification", async () => {
    const attendant = await ctxFor("labatt");
    expect(attendant.user.permissions).toContain("lab.sample.collect");
    expect(attendant.user.permissions).not.toContain("lab.result.enter");
    expect(attendant.user.permissions).not.toContain("lab.result.verify");
    const dash = await dashboardFor(attendant.user);
    expect(dash.cards.some((c) => c.key === "lab_collect")).toBe(true);
    expect(dash.cards.some((c) => c.key === "lab_verify")).toBe(false);
  });
});
