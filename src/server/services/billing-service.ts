import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { billableServices, invoiceItems, invoices, payments, refunds } from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import { lineTotal } from "../money";
import type { AuthContext } from "../auth/session";
import { nextFormattedNumber } from "../sequences";

const invoiceSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  encounterId: z.string().uuid().optional().nullable(),
  source: z.enum(["consultation", "lab", "pharmacy", "service", "mixed"]),
  discountCents: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    itemType: z.enum(["consultation", "lab", "pharmacy", "service"]),
    referenceId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(200),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    discountCents: z.number().int().nonnegative().optional(),
    taxBps: z.number().int().min(0).max(5000).optional(),
  })).min(1),
});

export async function createInvoice(ctx: AuthContext, input: unknown) {
  const parsed = invoiceSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const invoiceNo = await nextFormattedNumber(tx, "invoice");
    const [invoice] = await tx.insert(invoices).values({
      invoiceNo,
      patientId: parsed.patientId ?? null,
      encounterId: parsed.encounterId ?? null,
      source: parsed.source,
      notes: parsed.notes ?? null,
      createdBy: ctx.user.id,
      status: "open",
    }).returning();
    let subtotal = 0;
    let tax = 0;
    let itemDiscount = 0;
    for (const item of parsed.items) {
      const lt = lineTotal({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents ?? 0,
        taxBps: item.taxBps ?? 0,
      });
      subtotal += item.quantity * item.unitPriceCents;
      itemDiscount += item.discountCents ?? 0;
      tax += lt.taxCents;
      await tx.insert(invoiceItems).values({
        invoiceId: invoice.id,
        itemType: item.itemType,
        referenceId: item.referenceId ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents ?? 0,
        taxBps: item.taxBps ?? 0,
        taxCents: lt.taxCents,
        lineTotalCents: lt.lineTotalCents,
      });
    }
    const headerDiscount = parsed.discountCents ?? 0;
    const discount = headerDiscount + itemDiscount;
    if (discount > subtotal) throw badRequest("Discount exceeds subtotal");
    const total = subtotal - discount + tax;
    const [final] = await tx.update(invoices).set({
      subtotalCents: subtotal,
      discountCents: discount,
      taxCents: tax,
      totalCents: total,
    }).where(eq(invoices.id, invoice.id)).returning();
    await writeAudit({ ctx, action: "create", module: "billing", entity: "invoice", entityId: invoice.id, newValue: { invoiceNo, total }, result: "success" });
    return final;
  });
}

export async function recordPayment(ctx: AuthContext, input: { invoiceId: string; method: "cash" | "card" | "upi" | "credit" | "bank"; amountCents: number; reference?: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw badRequest("Invalid amount");
  const db = getDb();
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update"))[0];
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status === "cancelled") throw badRequest("Cannot pay a cancelled invoice");
    const due = invoice.totalCents - (invoice.paidCents - invoice.refundedCents);
    if (input.amountCents > due) throw conflict("Payment exceeds amount due");
    const paymentNo = await nextFormattedNumber(tx, "payment");
    const [payment] = await tx.insert(payments).values({
      paymentNo,
      invoiceId: invoice.id,
      method: input.method,
      amountCents: input.amountCents,
      reference: input.reference ?? null,
      receivedBy: ctx.user.id,
    }).returning();
    const paid = invoice.paidCents + input.amountCents;
    const net = paid - invoice.refundedCents;
    const status = net >= invoice.totalCents ? "paid" : "partial";
    await tx.update(invoices).set({ paidCents: paid, status, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    await writeAudit({ ctx, action: "payment", module: "billing", entity: "payment", entityId: payment.id, newValue: { amountCents: input.amountCents, invoiceId: invoice.id }, result: "success" });
    return payment;
  });
}

export async function refundInvoice(ctx: AuthContext, input: { invoiceId: string; amountCents: number; reason: string; method: "cash" | "card" | "upi" | "bank" }) {
  if (!input.reason.trim()) throw badRequest("Refund reason required");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw badRequest("Invalid amount");
  const db = getDb();
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update"))[0];
    if (!invoice) throw notFound();
    if (invoice.status === "cancelled") throw badRequest("Invoice cancelled");
    const refundable = invoice.paidCents - invoice.refundedCents;
    if (input.amountCents > refundable) throw conflict("Refund exceeds paid amount");
    const refundNo = await nextFormattedNumber(tx, "refund");
    const [row] = await tx.insert(refunds).values({
      refundNo,
      invoiceId: invoice.id,
      amountCents: input.amountCents,
      reason: input.reason,
      method: input.method,
      processedBy: ctx.user.id,
    }).returning();
    const refunded = invoice.refundedCents + input.amountCents;
    const net = invoice.paidCents - refunded;
    const status = refunded >= invoice.paidCents && invoice.paidCents >= invoice.totalCents ? "refunded" : net <= 0 ? "refunded" : invoice.status;
    await tx.update(invoices).set({ refundedCents: refunded, status, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    await writeAudit({ ctx, action: "refund", module: "billing", entity: "refund", entityId: row.id, previousValue: { paid: invoice.paidCents }, newValue: { amountCents: input.amountCents, reason: input.reason }, result: "success" });
    return row;
  });
}

export async function cancelInvoice(ctx: AuthContext, invoiceId: string, reason: string) {
  const db = getDb();
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) throw notFound();
  if (invoice.paidCents - invoice.refundedCents > 0) throw badRequest("Refund payments before cancelling");
  const [row] = await db.update(invoices).set({
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: ctx.user.id,
    cancelReason: reason,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning();
  await writeAudit({ ctx, action: "cancel", module: "billing", entity: "invoice", entityId: invoiceId, newValue: { reason }, result: "success" });
  return row;
}

export async function getInvoice(id: string) {
  const db = getDb();
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, id)).limit(1))[0];
  if (!invoice) throw notFound();
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  const pays = await db.select().from(payments).where(eq(payments.invoiceId, id));
  const rfd = await db.select().from(refunds).where(eq(refunds.invoiceId, id));
  return { invoice, items, payments: pays, refunds: rfd };
}

export async function listInvoices(opts: { patientId?: string; status?: string; from?: string; to?: string }) {
  const db = getDb();
  const filters = [];
  if (opts.patientId) filters.push(eq(invoices.patientId, opts.patientId));
  if (opts.status) filters.push(eq(invoices.status, opts.status));
  if (opts.from) filters.push(gte(invoices.createdAt, new Date(opts.from)));
  if (opts.to) filters.push(lte(invoices.createdAt, new Date(opts.to)));
  const where = filters.length ? and(...filters) : undefined;
  return db.select().from(invoices).where(where).orderBy(desc(invoices.createdAt)).limit(200);
}

export async function listServices() {
  return getDb().select().from(billableServices).orderBy(billableServices.name);
}

export async function upsertService(ctx: AuthContext, input: { id?: string; code: string; name: string; category: string; priceCents: number; taxBps?: number; isActive?: boolean }) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(billableServices).set({
      code: input.code,
      name: input.name,
      category: input.category,
      priceCents: input.priceCents,
      taxBps: input.taxBps ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(billableServices.id, input.id)).returning();
    await writeAudit({ ctx, action: "update", module: "billing", entity: "service", entityId: input.id, newValue: { priceCents: input.priceCents }, result: "success" });
    return row;
  }
  const [row] = await db.insert(billableServices).values({
    code: input.code,
    name: input.name,
    category: input.category,
    priceCents: input.priceCents,
    taxBps: input.taxBps ?? 0,
  }).returning();
  return row;
}

export async function revenueSummary(from: Date, to: Date) {
  const db = getDb();
  const [row] = await db
    .select({
      invoiceCount: sql<number>`count(*)`,
      totalCents: sql<number>`coalesce(sum(${invoices.totalCents}),0)`,
      paidCents: sql<number>`coalesce(sum(${invoices.paidCents}),0)`,
      refundedCents: sql<number>`coalesce(sum(${invoices.refundedCents}),0)`,
    })
    .from(invoices)
    .where(and(gte(invoices.createdAt, from), lte(invoices.createdAt, to), sql`${invoices.status} <> 'cancelled'`));
  return row;
}
