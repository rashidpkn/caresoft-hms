import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { labCategories, labOrderItems, labOrders, labResults, labSamples, labTests } from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, notFound } from "../errors";
import type { AuthContext } from "../auth/session";
import { nextFormattedNumber } from "../sequences";
import { createInvoice } from "./billing-service";

export async function listLabTests() {
  return getDb().select().from(labTests).orderBy(labTests.name);
}

export async function listLabCategories() {
  return getDb().select().from(labCategories).orderBy(labCategories.name);
}

export async function upsertLabTest(ctx: AuthContext, input: {
  id?: string;
  code: string;
  name: string;
  categoryId?: string | null;
  specimenType?: string;
  priceCents: number;
  unit?: string;
  referenceRange?: string;
  isActive?: boolean;
}) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(labTests).set({
      code: input.code,
      name: input.name,
      categoryId: input.categoryId ?? null,
      specimenType: input.specimenType ?? "blood",
      priceCents: input.priceCents,
      unit: input.unit ?? null,
      referenceRange: input.referenceRange ?? null,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(labTests.id, input.id)).returning();
    return row;
  }
  const [row] = await db.insert(labTests).values({
    code: input.code,
    name: input.name,
    categoryId: input.categoryId ?? null,
    specimenType: input.specimenType ?? "blood",
    priceCents: input.priceCents,
    unit: input.unit ?? null,
    referenceRange: input.referenceRange ?? null,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "lab", entity: "lab_test", entityId: row.id, result: "success" });
  return row;
}

export async function upsertLabCategory(name: string, id?: string) {
  const db = getDb();
  if (id) {
    const [row] = await db.update(labCategories).set({ name, updatedAt: new Date() }).where(eq(labCategories.id, id)).returning();
    return row;
  }
  const [row] = await db.insert(labCategories).values({ name }).returning();
  return row;
}

const orderSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional().nullable(),
  testIds: z.array(z.string().uuid()).min(1),
  priority: z.enum(["routine", "urgent", "stat"]).optional(),
  clinicalNotes: z.string().max(1000).optional(),
  bill: z.boolean().optional(),
});

export async function createLabOrder(ctx: AuthContext, input: unknown) {
  const parsed = orderSchema.parse(input);
  const db = getDb();
  const tests = await db.select().from(labTests).where(inArray(labTests.id, parsed.testIds));
  if (tests.length !== parsed.testIds.length) throw badRequest("One or more tests were not found");
  const order = await db.transaction(async (tx) => {
    const orderNo = await nextFormattedNumber(tx, "lab_order");
    const [row] = await tx.insert(labOrders).values({
      orderNo,
      patientId: parsed.patientId,
      encounterId: parsed.encounterId ?? null,
      orderedBy: ctx.user.id,
      priority: parsed.priority ?? "routine",
      clinicalNotes: parsed.clinicalNotes ?? null,
      status: "ordered",
    }).returning();
    await tx.insert(labOrderItems).values(tests.map((t) => ({
      orderId: row.id,
      testId: t.id,
      status: "ordered",
    })));
    return row;
  });
  if (parsed.bill !== false) {
    const invoice = await createInvoice(ctx, {
      patientId: parsed.patientId,
      encounterId: parsed.encounterId ?? null,
      source: "lab",
      items: tests.map((t) => ({
        itemType: "lab" as const,
        referenceId: t.id,
        description: t.name,
        quantity: 1,
        unitPriceCents: t.priceCents,
        taxBps: 0,
      })),
    });
    await db.update(labOrders).set({ billedInvoiceId: invoice.id }).where(eq(labOrders.id, order.id));
  }
  await writeAudit({ ctx, action: "create", module: "lab", entity: "lab_order", entityId: order.id, result: "success" });
  return getLabOrder(order.id);
}

export async function collectSample(ctx: AuthContext, orderId: string, specimenType: string, notes?: string) {
  const db = getDb();
  const order = (await db.select().from(labOrders).where(eq(labOrders.id, orderId)).limit(1))[0];
  if (!order) throw notFound();
  const sample = await db.transaction(async (tx) => {
    const sampleNo = await nextFormattedNumber(tx, "lab_sample");
    const [row] = await tx.insert(labSamples).values({
      sampleNo,
      orderId,
      specimenType,
      status: "collected",
      collectedBy: ctx.user.id,
      notes: notes ?? null,
    }).returning();
    await tx.update(labOrders).set({ status: "sample_collected", updatedAt: new Date() }).where(eq(labOrders.id, orderId));
    await tx.update(labOrderItems).set({ status: "sample_collected" }).where(eq(labOrderItems.orderId, orderId));
    return row;
  });
  await writeAudit({ ctx, action: "collect_sample", module: "lab", entity: "lab_sample", entityId: sample.id, result: "success" });
  return sample;
}

export async function receiveSample(ctx: AuthContext, sampleId: string) {
  const db = getDb();
  const [row] = await db.update(labSamples).set({
    status: "received",
    receivedBy: ctx.user.id,
    receivedAt: new Date(),
  }).where(eq(labSamples.id, sampleId)).returning();
  if (!row) throw notFound();
  await db.update(labOrders).set({ status: "processing", updatedAt: new Date() }).where(eq(labOrders.id, row.orderId));
  await writeAudit({ ctx, action: "receive_sample", module: "lab", entity: "lab_sample", entityId: sampleId, result: "success" });
  return row;
}

export async function enterResult(ctx: AuthContext, orderItemId: string, value: string, flag?: string, notes?: string, sampleId?: string) {
  const db = getDb();
  const item = (await db.select().from(labOrderItems).where(eq(labOrderItems.id, orderItemId)).limit(1))[0];
  if (!item) throw notFound();
  const existing = (await db.select().from(labResults).where(eq(labResults.orderItemId, orderItemId)).limit(1))[0];
  if (existing?.status === "verified") throw badRequest("Verified results cannot be edited");
  const test = (await db.select().from(labTests).where(eq(labTests.id, item.testId)).limit(1))[0];
  if (existing) {
    const [row] = await db.update(labResults).set({
      value,
      flag: flag ?? null,
      notes: notes ?? null,
      sampleId: sampleId ?? existing.sampleId,
      enteredBy: ctx.user.id,
      enteredAt: new Date(),
      status: "entered",
      updatedAt: new Date(),
    }).where(eq(labResults.id, existing.id)).returning();
    await writeAudit({ ctx, action: "update_result", module: "lab", entity: "lab_result", entityId: row.id, previousValue: { value: existing.value }, newValue: { value }, result: "success" });
    return row;
  }
  const [row] = await db.insert(labResults).values({
    orderItemId,
    sampleId: sampleId ?? null,
    value,
    unit: test?.unit ?? null,
    flag: flag ?? null,
    notes: notes ?? null,
    enteredBy: ctx.user.id,
    enteredAt: new Date(),
    status: "entered",
  }).returning();
  await db.update(labOrderItems).set({ status: "result_entered" }).where(eq(labOrderItems.id, orderItemId));
  await writeAudit({ ctx, action: "enter_result", module: "lab", entity: "lab_result", entityId: row.id, newValue: { value }, result: "success" });
  return row;
}

export async function verifyResult(ctx: AuthContext, resultId: string) {
  const db = getDb();
  const existing = (await db.select().from(labResults).where(eq(labResults.id, resultId)).limit(1))[0];
  if (!existing) throw notFound();
  if (existing.status !== "entered") throw badRequest("Result is not ready for verification");
  if (existing.enteredBy === ctx.user.id) throw badRequest("The person who entered a result cannot verify it");
  const [row] = await db.update(labResults).set({
    status: "verified",
    verifiedBy: ctx.user.id,
    verifiedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(labResults.id, resultId)).returning();
  const item = (await db.select().from(labOrderItems).where(eq(labOrderItems.id, existing.orderItemId)).limit(1))[0];
  if (item) {
    await db.update(labOrderItems).set({ status: "verified" }).where(eq(labOrderItems.id, item.id));
    const siblings = await db.select().from(labOrderItems).where(eq(labOrderItems.orderId, item.orderId));
    const allVerified = siblings.every((s) => s.status === "verified" || s.id === item.id);
    if (allVerified) {
      await db.update(labOrders).set({ status: "completed", updatedAt: new Date() }).where(eq(labOrders.id, item.orderId));
    }
  }
  await writeAudit({ ctx, action: "verify_result", module: "lab", entity: "lab_result", entityId: resultId, result: "success" });
  return row;
}

export async function getLabOrder(id: string) {
  const db = getDb();
  const order = (await db.select().from(labOrders).where(eq(labOrders.id, id)).limit(1))[0];
  if (!order) throw notFound();
  const items = await db.select().from(labOrderItems).where(eq(labOrderItems.orderId, id));
  const tests = items.length ? await db.select().from(labTests).where(inArray(labTests.id, items.map((i) => i.testId))) : [];
  const testMap = new Map(tests.map((t) => [t.id, t]));
  const results = items.length
    ? await db.select().from(labResults).where(inArray(labResults.orderItemId, items.map((i) => i.id)))
    : [];
  const samples = await db.select().from(labSamples).where(eq(labSamples.orderId, id));
  return {
    order,
    items: items.map((i) => ({
      ...i,
      test: testMap.get(i.testId) ?? null,
      result: results.find((r) => r.orderItemId === i.id) ?? null,
    })),
    samples,
  };
}

export async function listLabOrders(status?: string) {
  const db = getDb();
  if (status) return db.select().from(labOrders).where(eq(labOrders.status, status)).orderBy(desc(labOrders.createdAt)).limit(200);
  return db.select().from(labOrders).orderBy(desc(labOrders.createdAt)).limit(200);
}
