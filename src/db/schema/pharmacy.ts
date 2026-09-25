import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const medicineCategories = pgTable("medicine_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("medicine_categories_name_uidx").on(t.name)]);

export const medicines = pgTable("medicines", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  brand: text("brand"),
  categoryId: uuid("category_id").references(() => medicineCategories.id),
  unit: text("unit").notNull().default("strip"),
  strength: text("strength"),
  hsnCode: text("hsn_code"),
  gstBps: integer("gst_bps").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(10),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("medicines_sku_uidx").on(t.sku),
  index("medicines_name_idx").on(t.name),
]);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  gstin: text("gstin"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("suppliers_code_uidx").on(t.code)]);

export const medicineBatches = pgTable("medicine_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
  batchNumber: text("batch_number").notNull(),
  packing: text("packing"),
  stripCount: integer("strip_count"),
  mrpCents: integer("mrp_cents").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  purchaseRateCents: integer("purchase_rate_cents").notNull(),
  gstBps: integer("gst_bps").notNull().default(0),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  quantityReserved: integer("quantity_reserved").notNull().default(0),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  expiryDate: date("expiry_date").notNull(),
  receivedAt: date("received_at"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("medicine_batches_med_batch_uidx").on(t.medicineId, t.batchNumber),
  index("medicine_batches_expiry_idx").on(t.expiryDate),
  index("medicine_batches_stock_idx").on(t.medicineId),
]);

export const purchases = pgTable("purchases", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseNo: text("purchase_no").notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  invoiceNo: text("invoice_no"),
  status: text("status").notNull().default("received"),
  purchasedAt: date("purchased_at").notNull(),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [uniqueIndex("purchases_no_uidx").on(t.purchaseNo)]);

export const purchaseItems = pgTable("purchase_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id),
  medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
  batchId: uuid("batch_id").references(() => medicineBatches.id),
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date").notNull(),
  quantity: integer("quantity").notNull(),
  purchaseRateCents: integer("purchase_rate_cents").notNull(),
  mrpCents: integer("mrp_cents").notNull(),
  gstBps: integer("gst_bps").notNull().default(0),
  lineTotalCents: integer("line_total_cents").notNull(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => medicineBatches.id),
  medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
  type: text("type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("inventory_movements_batch_idx").on(t.batchId, t.createdAt),
  index("inventory_movements_ref_idx").on(t.referenceType, t.referenceId),
]);
