import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  inventoryMovements,
  invoiceItems,
  invoices,
  medicineBatches,
  medicineCategories,
  medicines,
  payments,
  purchaseItems,
  purchases,
  refunds,
  suppliers,
} from "@/db/schema";
import { writeAudit } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import { lineTotal } from "../money";
import type { AuthContext } from "../auth/session";
import { nextFormattedNumber } from "../sequences";

export async function listMedicines(q?: string) {
  const db = getDb();
  if (!q) return db.select().from(medicines).orderBy(medicines.name).limit(200);
  return db.select().from(medicines).where(sql`${medicines.name} ilike ${"%" + q + "%"} or ${medicines.sku} ilike ${"%" + q + "%"}`).orderBy(medicines.name).limit(100);
}

export async function upsertMedicine(ctx: AuthContext, input: {
  id?: string;
  sku: string;
  name: string;
  genericName?: string;
  brand?: string;
  categoryId?: string | null;
  unit?: string;
  strength?: string;
  gstBps?: number;
  reorderLevel?: number;
  isActive?: boolean;
}) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(medicines).set({
      sku: input.sku,
      name: input.name,
      genericName: input.genericName ?? null,
      brand: input.brand ?? null,
      categoryId: input.categoryId ?? null,
      unit: input.unit ?? "strip",
      strength: input.strength ?? null,
      gstBps: input.gstBps ?? 0,
      reorderLevel: input.reorderLevel ?? 10,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(eq(medicines.id, input.id)).returning();
    await writeAudit({ ctx, action: "update", module: "pharmacy", entity: "medicine", entityId: input.id, result: "success" });
    return row;
  }
  const [row] = await db.insert(medicines).values({
    sku: input.sku,
    name: input.name,
    genericName: input.genericName ?? null,
    brand: input.brand ?? null,
    categoryId: input.categoryId ?? null,
    unit: input.unit ?? "strip",
    strength: input.strength ?? null,
    gstBps: input.gstBps ?? 0,
    reorderLevel: input.reorderLevel ?? 10,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "pharmacy", entity: "medicine", entityId: row.id, result: "success" });
  return row;
}

export async function listCategories() {
  return getDb().select().from(medicineCategories).orderBy(medicineCategories.name);
}

export async function upsertCategory(ctx: AuthContext, name: string, id?: string) {
  const db = getDb();
  if (id) {
    const [row] = await db.update(medicineCategories).set({ name, updatedAt: new Date() }).where(eq(medicineCategories.id, id)).returning();
    return row;
  }
  const [row] = await db.insert(medicineCategories).values({ name }).returning();
  await writeAudit({ ctx, action: "create", module: "pharmacy", entity: "medicine_category", entityId: row.id, result: "success" });
  return row;
}

export async function listSuppliers() {
  return getDb().select().from(suppliers).orderBy(suppliers.name);
}

export async function upsertSupplier(ctx: AuthContext, input: { id?: string; code: string; name: string; phone?: string; email?: string; address?: string; gstin?: string }) {
  const db = getDb();
  if (input.id) {
    const [row] = await db.update(suppliers).set({ ...input, updatedAt: new Date() }).where(eq(suppliers.id, input.id)).returning();
    return row;
  }
  const [row] = await db.insert(suppliers).values({
    code: input.code,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    gstin: input.gstin ?? null,
  }).returning();
  await writeAudit({ ctx, action: "create", module: "pharmacy", entity: "supplier", entityId: row.id, result: "success" });
  return row;
}

export async function listBatches(opts?: { medicineId?: string; expiringDays?: number; lowStock?: boolean }) {
  const db = getDb();
  const filters = [eq(medicineBatches.isActive, true)];
  if (opts?.medicineId) filters.push(eq(medicineBatches.medicineId, opts.medicineId));
  if (opts?.expiringDays) {
    const until = new Date();
    until.setDate(until.getDate() + opts.expiringDays);
    filters.push(lte(medicineBatches.expiryDate, until.toISOString().slice(0, 10)));
  }
  if (opts?.lowStock) filters.push(sql`${medicineBatches.quantityOnHand} <= 10`);
  return db
    .select({
      id: medicineBatches.id,
      batchNumber: medicineBatches.batchNumber,
      medicineId: medicineBatches.medicineId,
      medicineName: medicines.name,
      quantityOnHand: medicineBatches.quantityOnHand,
      quantityReserved: medicineBatches.quantityReserved,
      mrpCents: medicineBatches.mrpCents,
      unitPriceCents: medicineBatches.unitPriceCents,
      purchaseRateCents: medicineBatches.purchaseRateCents,
      gstBps: medicineBatches.gstBps,
      expiryDate: medicineBatches.expiryDate,
      packing: medicineBatches.packing,
    })
    .from(medicineBatches)
    .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
    .where(and(...filters))
    .orderBy(medicineBatches.expiryDate);
}

const receiveSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNo: z.string().max(40).optional(),
  purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    medicineId: z.string().uuid(),
    batchNumber: z.string().min(1).max(40),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().int().positive(),
    purchaseRateCents: z.number().int().nonnegative(),
    mrpCents: z.number().int().nonnegative(),
    unitPriceCents: z.number().int().nonnegative(),
    gstBps: z.number().int().min(0).max(5000).optional(),
    packing: z.string().optional(),
  })).min(1),
});

export async function receivePurchase(ctx: AuthContext, input: unknown) {
  const parsed = receiveSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const purchaseNo = await nextFormattedNumber(tx, "purchase");
    let subtotal = 0;
    let tax = 0;
    const [purchase] = await tx.insert(purchases).values({
      purchaseNo,
      supplierId: parsed.supplierId,
      invoiceNo: parsed.invoiceNo ?? null,
      purchasedAt: parsed.purchasedAt,
      notes: parsed.notes ?? null,
      createdBy: ctx.user.id,
      status: "received",
    }).returning();

    for (const item of parsed.items) {
      const existing = (await tx
        .select()
        .from(medicineBatches)
        .where(and(eq(medicineBatches.medicineId, item.medicineId), eq(medicineBatches.batchNumber, item.batchNumber)))
        .for("update"))[0];
      let batchId: string;
      if (existing) {
        if (existing.expiryDate !== item.expiryDate) {
          throw conflict(`Batch ${item.batchNumber} already exists with a different expiry`);
        }
        const qty = existing.quantityOnHand + item.quantity;
        await tx.update(medicineBatches).set({
          quantityOnHand: qty,
          updatedAt: new Date(),
        }).where(eq(medicineBatches.id, existing.id));
        batchId = existing.id;
        await tx.insert(inventoryMovements).values({
          batchId,
          medicineId: item.medicineId,
          type: "purchase",
          quantityDelta: item.quantity,
          quantityAfter: qty,
          referenceType: "purchase",
          referenceId: purchase.id,
          createdBy: ctx.user.id,
        });
      } else {
        const [batch] = await tx.insert(medicineBatches).values({
          medicineId: item.medicineId,
          batchNumber: item.batchNumber,
          packing: item.packing ?? null,
          mrpCents: item.mrpCents,
          unitPriceCents: item.unitPriceCents,
          purchaseRateCents: item.purchaseRateCents,
          gstBps: item.gstBps ?? 0,
          quantityOnHand: item.quantity,
          supplierId: parsed.supplierId,
          expiryDate: item.expiryDate,
          receivedAt: parsed.purchasedAt,
        }).returning();
        batchId = batch.id;
        await tx.insert(inventoryMovements).values({
          batchId,
          medicineId: item.medicineId,
          type: "purchase",
          quantityDelta: item.quantity,
          quantityAfter: item.quantity,
          referenceType: "purchase",
          referenceId: purchase.id,
          createdBy: ctx.user.id,
        });
      }
      const lt = lineTotal({
        quantity: item.quantity,
        unitPriceCents: item.purchaseRateCents,
        taxBps: item.gstBps ?? 0,
      });
      subtotal += item.quantity * item.purchaseRateCents;
      tax += lt.taxCents;
      await tx.insert(purchaseItems).values({
        purchaseId: purchase.id,
        medicineId: item.medicineId,
        batchId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        purchaseRateCents: item.purchaseRateCents,
        mrpCents: item.mrpCents,
        gstBps: item.gstBps ?? 0,
        lineTotalCents: lt.lineTotalCents,
      });
    }
    const [updated] = await tx.update(purchases).set({
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: subtotal + tax,
    }).where(eq(purchases.id, purchase.id)).returning();
    await writeAudit({ ctx, action: "receive", module: "pharmacy", entity: "purchase", entityId: purchase.id, result: "success" });
    return updated;
  });
}

const saleSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    batchId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  discountCents: z.number().int().nonnegative().optional(),
  paymentMethod: z.enum(["cash", "card", "upi", "credit"]).optional(),
  amountTenderedCents: z.number().int().nonnegative().optional(),
});

export async function sellMedicines(ctx: AuthContext, input: unknown) {
  const parsed = saleSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const invoiceNo = await nextFormattedNumber(tx, "invoice");
    const [invoice] = await tx.insert(invoices).values({
      invoiceNo,
      patientId: parsed.patientId ?? null,
      source: "pharmacy",
      status: "open",
      createdBy: ctx.user.id,
    }).returning();

    let subtotal = 0;
    let tax = 0;
    for (const item of parsed.items) {
      const batch = (await tx.select().from(medicineBatches).where(eq(medicineBatches.id, item.batchId)).for("update"))[0];
      if (!batch || !batch.isActive) throw notFound("Batch not found");
      if (batch.expiryDate < new Date().toISOString().slice(0, 10)) {
        throw badRequest(`Batch ${batch.batchNumber} is expired`);
      }
      const available = batch.quantityOnHand - batch.quantityReserved;
      if (available < item.quantity) {
        throw conflict(`Insufficient stock for batch ${batch.batchNumber}`);
      }
      const qtyAfter = batch.quantityOnHand - item.quantity;
      const updated = await tx.update(medicineBatches)
        .set({ quantityOnHand: qtyAfter, updatedAt: new Date() })
        .where(and(eq(medicineBatches.id, batch.id), sql`${medicineBatches.quantityOnHand} >= ${item.quantity}`))
        .returning();
      if (!updated[0]) throw conflict("Stock changed concurrently; retry");
      const medicine = (await tx.select().from(medicines).where(eq(medicines.id, batch.medicineId)).limit(1))[0];
      const lt = lineTotal({
        quantity: item.quantity,
        unitPriceCents: batch.unitPriceCents,
        taxBps: batch.gstBps,
      });
      subtotal += item.quantity * batch.unitPriceCents;
      tax += lt.taxCents;
      await tx.insert(invoiceItems).values({
        invoiceId: invoice.id,
        itemType: "pharmacy",
        referenceId: batch.id,
        description: `${medicine?.name ?? "Medicine"} (${batch.batchNumber})`,
        quantity: item.quantity,
        unitPriceCents: batch.unitPriceCents,
        taxBps: batch.gstBps,
        taxCents: lt.taxCents,
        lineTotalCents: lt.lineTotalCents,
        metadata: JSON.stringify({ medicineId: batch.medicineId, batchId: batch.id }),
      });
      await tx.insert(inventoryMovements).values({
        batchId: batch.id,
        medicineId: batch.medicineId,
        type: "sale",
        quantityDelta: -item.quantity,
        quantityAfter: qtyAfter,
        referenceType: "invoice",
        referenceId: invoice.id,
        createdBy: ctx.user.id,
      });
    }
    const discount = parsed.discountCents ?? 0;
    if (discount > subtotal) throw badRequest("Discount exceeds subtotal");
    const total = subtotal - discount + tax;
    await tx.update(invoices).set({
      subtotalCents: subtotal,
      discountCents: discount,
      taxCents: tax,
      totalCents: total,
    }).where(eq(invoices.id, invoice.id));

    let paid = 0;
    if (parsed.paymentMethod && parsed.amountTenderedCents) {
      if (parsed.amountTenderedCents > total) throw badRequest("Payment exceeds invoice total");
      const paymentNo = await nextFormattedNumber(tx, "payment");
      await tx.insert(payments).values({
        paymentNo,
        invoiceId: invoice.id,
        method: parsed.paymentMethod,
        amountCents: parsed.amountTenderedCents,
        receivedBy: ctx.user.id,
      });
      paid = parsed.amountTenderedCents;
    }
    const status = paid === 0 ? "open" : paid >= total ? "paid" : "partial";
    const [finalInvoice] = await tx.update(invoices).set({
      paidCents: paid,
      status,
    }).where(eq(invoices.id, invoice.id)).returning();
    await writeAudit({ ctx, action: "sale", module: "pharmacy", entity: "invoice", entityId: invoice.id, newValue: { invoiceNo, total }, result: "success" });
    return finalInvoice;
  });
}

export async function saleReturn(ctx: AuthContext, invoiceId: string, items: { batchId: string; quantity: number }[], reason: string) {
  if (!items.length) throw badRequest("Return requires items");
  if (!reason.trim()) throw badRequest("Return reason is required");
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) throw badRequest("Return quantity must be a positive whole number");
  const db = getDb();
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update"))[0];
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.source !== "pharmacy") throw badRequest("Not a pharmacy invoice");
    if (invoice.status === "cancelled") throw badRequest("Invoice cancelled");

    const soldLines = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    const priorReturns = await tx
      .select({ batchId: inventoryMovements.batchId, qty: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}),0)` })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.referenceId, invoice.id), eq(inventoryMovements.type, "sale_return")))
      .groupBy(inventoryMovements.batchId);

    let refundCents = 0;
    for (const item of items) {
      const line = soldLines.find((l) => {
        const meta = l.metadata ? (JSON.parse(l.metadata) as { batchId?: string }) : {};
        return meta.batchId === item.batchId;
      });
      if (!line) throw badRequest("That batch was not dispensed on this bill");
      const already = Number(priorReturns.find((r) => r.batchId === item.batchId)?.qty ?? 0);
      if (item.quantity + already > line.quantity) {
        throw conflict(`Cannot return more than dispensed for ${line.description}`);
      }
      const batch = (await tx.select().from(medicineBatches).where(eq(medicineBatches.id, item.batchId)).for("update"))[0];
      if (!batch) throw notFound("Batch not found");
      const qtyAfter = batch.quantityOnHand + item.quantity;
      await tx.update(medicineBatches).set({ quantityOnHand: qtyAfter, updatedAt: new Date() }).where(eq(medicineBatches.id, batch.id));
      refundCents += item.quantity * line.unitPriceCents;
      await tx.insert(inventoryMovements).values({
        batchId: batch.id,
        medicineId: batch.medicineId,
        type: "sale_return",
        quantityDelta: item.quantity,
        quantityAfter: qtyAfter,
        referenceType: "invoice",
        referenceId: invoice.id,
        reason,
        createdBy: ctx.user.id,
      });
    }

    // Money is only refunded for what the patient actually paid.
    const refundable = invoice.paidCents - invoice.refundedCents;
    const cashBack = Math.min(refundCents, Math.max(0, refundable));
    if (cashBack > 0) {
      const refundNo = await nextFormattedNumber(tx, "refund");
      await tx.insert(refunds).values({
        refundNo,
        invoiceId: invoice.id,
        amountCents: cashBack,
        reason,
        method: "cash",
        processedBy: ctx.user.id,
      });
    }
    const refunded = invoice.refundedCents + cashBack;
    const [updated] = await tx.update(invoices).set({
      refundedCents: refunded,
      status: refunded > 0 && refunded >= invoice.paidCents && invoice.paidCents >= invoice.totalCents ? "refunded" : invoice.status,
      updatedAt: new Date(),
    }).where(eq(invoices.id, invoice.id)).returning();
    await writeAudit({
      ctx,
      action: "sale_return",
      module: "pharmacy",
      entity: "invoice",
      entityId: invoice.id,
      newValue: { goodsValueCents: refundCents, cashRefundedCents: cashBack, reason },
      result: "success",
    });
    return { invoice: updated, goodsValueCents: refundCents, cashRefundedCents: cashBack };
  });
}

export async function adjustStock(ctx: AuthContext, batchId: string, quantityDelta: number, reason: string) {
  if (!reason.trim()) throw badRequest("Adjustment reason is required");
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) throw badRequest("Invalid quantity");
  const db = getDb();
  return db.transaction(async (tx) => {
    const batch = (await tx.select().from(medicineBatches).where(eq(medicineBatches.id, batchId)).for("update"))[0];
    if (!batch) throw notFound();
    const qtyAfter = batch.quantityOnHand + quantityDelta;
    if (qtyAfter < 0) throw conflict("Adjustment would make stock negative");
    await tx.update(medicineBatches).set({ quantityOnHand: qtyAfter, updatedAt: new Date() }).where(eq(medicineBatches.id, batchId));
    await tx.insert(inventoryMovements).values({
      batchId,
      medicineId: batch.medicineId,
      type: "adjustment",
      quantityDelta,
      quantityAfter: qtyAfter,
      reason,
      createdBy: ctx.user.id,
    });
    await writeAudit({ ctx, action: "adjust", module: "inventory", entity: "batch", entityId: batchId, newValue: { quantityDelta, reason, qtyAfter }, result: "success" });
    return { batchId, quantityOnHand: qtyAfter };
  });
}

/** Dispensable stock, expiry-first (FEFO) so staff pick the oldest usable batch. */
export async function dispensableStock(q?: string) {
  const db = getDb();
  const filters = [
    eq(medicineBatches.isActive, true),
    sql`${medicineBatches.quantityOnHand} > ${medicineBatches.quantityReserved}`,
    sql`${medicineBatches.expiryDate} >= current_date`,
  ];
  if (q) {
    const term = `%${q}%`;
    filters.push(sql`(${medicines.name} ilike ${term} or ${medicines.sku} ilike ${term} or ${medicines.genericName} ilike ${term})`);
  }
  return db
    .select({
      batchId: medicineBatches.id,
      batchNumber: medicineBatches.batchNumber,
      medicineId: medicines.id,
      medicineName: medicines.name,
      genericName: medicines.genericName,
      sku: medicines.sku,
      unit: medicines.unit,
      strength: medicines.strength,
      quantityAvailable: sql<number>`${medicineBatches.quantityOnHand} - ${medicineBatches.quantityReserved}`,
      unitPriceCents: medicineBatches.unitPriceCents,
      mrpCents: medicineBatches.mrpCents,
      gstBps: medicineBatches.gstBps,
      expiryDate: medicineBatches.expiryDate,
    })
    .from(medicineBatches)
    .innerJoin(medicines, eq(medicineBatches.medicineId, medicines.id))
    .where(and(...filters))
    .orderBy(medicineBatches.expiryDate)
    .limit(100);
}

export async function listSales(limit = 50) {
  const db = getDb();
  return db
    .select({
      id: invoices.id,
      invoiceNo: invoices.invoiceNo,
      status: invoices.status,
      totalCents: invoices.totalCents,
      paidCents: invoices.paidCents,
      refundedCents: invoices.refundedCents,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.source, "pharmacy"))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

/** Sale detail used by the returns screen so the cashier can pick the dispensed lines. */
export async function getSaleDetail(invoiceId: string) {
  const db = getDb();
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) throw notFound("Sale not found");
  if (invoice.source !== "pharmacy") throw badRequest("Not a pharmacy sale");
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  const returned = await db
    .select({ batchId: inventoryMovements.batchId, qty: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}),0)` })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.referenceId, invoiceId), eq(inventoryMovements.type, "sale_return")))
    .groupBy(inventoryMovements.batchId);
  return {
    invoice,
    items: items.map((item) => {
      const meta = item.metadata ? (JSON.parse(item.metadata) as { batchId?: string }) : {};
      const alreadyReturned = Number(returned.find((r) => r.batchId === meta.batchId)?.qty ?? 0);
      return {
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        batchId: meta.batchId ?? null,
        returnableQuantity: Math.max(0, item.quantity - alreadyReturned),
      };
    }),
  };
}

export async function listPurchases() {
  return getDb().select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100);
}

export async function listMovements(batchId?: string) {
  const db = getDb();
  if (batchId) {
    return db.select().from(inventoryMovements).where(eq(inventoryMovements.batchId, batchId)).orderBy(desc(inventoryMovements.createdAt)).limit(200);
  }
  return db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.createdAt)).limit(200);
}
