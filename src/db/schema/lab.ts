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
import { encounters, patients } from "./clinical";
import { users } from "./identity";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const labCategories = pgTable("lab_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("lab_categories_name_uidx").on(t.name)]);

export const labTests = pgTable("lab_tests", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  categoryId: uuid("category_id").references(() => labCategories.id),
  specimenType: text("specimen_type").notNull().default("blood"),
  priceCents: integer("price_cents").notNull().default(0),
  unit: text("unit"),
  referenceRange: text("reference_range"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("lab_tests_code_uidx").on(t.code)]);

export const labOrders = pgTable("lab_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNo: text("order_no").notNull(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  encounterId: uuid("encounter_id").references(() => encounters.id),
  orderedBy: uuid("ordered_by").references(() => users.id),
  status: text("status").notNull().default("ordered"),
  priority: text("priority").notNull().default("routine"),
  clinicalNotes: text("clinical_notes"),
  billedInvoiceId: uuid("billed_invoice_id"),
  ...timestamps,
}, (t) => [
  uniqueIndex("lab_orders_no_uidx").on(t.orderNo),
  index("lab_orders_status_idx").on(t.status),
  index("lab_orders_patient_idx").on(t.patientId),
]);

export const labOrderItems = pgTable("lab_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => labOrders.id),
  testId: uuid("test_id").notNull().references(() => labTests.id),
  status: text("status").notNull().default("ordered"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const labSamples = pgTable("lab_samples", {
  id: uuid("id").defaultRandom().primaryKey(),
  sampleNo: text("sample_no").notNull(),
  orderId: uuid("order_id").notNull().references(() => labOrders.id),
  specimenType: text("specimen_type").notNull(),
  status: text("status").notNull().default("collected"),
  collectedBy: uuid("collected_by").references(() => users.id),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
  receivedBy: uuid("received_by").references(() => users.id),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("lab_samples_no_uidx").on(t.sampleNo),
  index("lab_samples_order_idx").on(t.orderId),
]);

export const labResults = pgTable("lab_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderItemId: uuid("order_item_id").notNull().references(() => labOrderItems.id),
  sampleId: uuid("sample_id").references(() => labSamples.id),
  value: text("value"),
  unit: text("unit"),
  flag: text("flag"),
  notes: text("notes"),
  enteredBy: uuid("entered_by").references(() => users.id),
  enteredAt: timestamp("entered_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  ...timestamps,
}, (t) => [
  uniqueIndex("lab_results_item_uidx").on(t.orderItemId),
]);
