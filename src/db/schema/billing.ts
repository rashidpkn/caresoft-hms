import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { patients } from "./clinical";
import { users } from "./identity";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const billableServices = pgTable("billable_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  taxBps: integer("tax_bps").notNull().default(0),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("billable_services_code_uidx").on(t.code)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNo: text("invoice_no").notNull(),
  patientId: uuid("patient_id").references(() => patients.id),
  encounterId: uuid("encounter_id"),
  source: text("source").notNull(),
  status: text("status").notNull().default("open"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  refundedCents: integer("refunded_cents").notNull().default(0),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by"),
  cancelReason: text("cancel_reason"),
  ...timestamps,
}, (t) => [
  uniqueIndex("invoices_no_uidx").on(t.invoiceNo),
  index("invoices_patient_idx").on(t.patientId),
  index("invoices_status_idx").on(t.status),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  itemType: text("item_type").notNull(),
  referenceId: uuid("reference_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  taxBps: integer("tax_bps").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  lineTotalCents: integer("line_total_cents").notNull(),
  metadata: text("metadata"),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentNo: text("payment_no").notNull(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reference: text("reference"),
  receivedBy: uuid("received_by").references(() => users.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("payments_no_uidx").on(t.paymentNo),
  index("payments_invoice_idx").on(t.invoiceId),
]);

export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  refundNo: text("refund_no").notNull(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  method: text("method").notNull(),
  processedBy: uuid("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("refunds_no_uidx").on(t.refundNo),
  index("refunds_invoice_idx").on(t.invoiceId),
]);
