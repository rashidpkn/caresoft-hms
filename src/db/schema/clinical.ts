import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { departments, users } from "./identity";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  mrn: text("mrn").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  sex: text("sex").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  bloodGroup: text("blood_group"),
  nationalId: text("national_id"),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  allergies: text("allergies"),
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  emergencyRelation: text("emergency_relation"),
  isActive: boolean("is_active").default(true).notNull(),
  registeredBy: uuid("registered_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  uniqueIndex("patients_mrn_uidx").on(t.mrn),
  index("patients_name_idx").on(t.lastName, t.firstName),
  index("patients_national_id_idx").on(t.nationalId),
]);

export const patientContacts = pgTable("patient_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  ...timestamps,
}, (t) => [
  index("patient_contacts_patient_idx").on(t.patientId),
]);

export const patientIdentifiers = pgTable("patient_identifiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("patient_identifiers_type_value_uidx").on(t.type, t.value),
]);

export const doctors = pgTable("doctors", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  departmentId: uuid("department_id").references(() => departments.id),
  specialization: text("specialization").notNull(),
  qualifications: text("qualifications"),
  licenseNo: text("license_no"),
  consultationFeeCents: integer("consultation_fee_cents").notNull().default(0),
  followUpFeeCents: integer("follow_up_fee_cents").notNull().default(0),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("doctors_user_uidx").on(t.userId),
  index("doctors_dept_idx").on(t.departmentId),
]);

export const doctorSchedules = pgTable("doctor_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  weekday: integer("weekday").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(15),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (t) => [
  index("doctor_schedules_doctor_idx").on(t.doctorId, t.weekday),
]);

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(15),
  reason: text("reason"),
  status: text("status").notNull().default("scheduled"),
  visitType: text("visit_type").notNull().default("consultation"),
  cancelledReason: text("cancelled_reason"),
  createdBy: uuid("created_by").references(() => users.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("appointments_doctor_time_idx").on(t.doctorId, t.scheduledAt),
  index("appointments_patient_idx").on(t.patientId),
  index("appointments_status_idx").on(t.status),
]);

export const queues = pgTable("queues", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  queueDate: date("queue_date").notNull(),
  tokenNumber: integer("token_number").notNull(),
  status: text("status").notNull().default("waiting"),
  calledAt: timestamp("called_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("queues_appointment_uidx").on(t.appointmentId),
  uniqueIndex("queues_doctor_date_token_uidx").on(t.doctorId, t.queueDate, t.tokenNumber),
  index("queues_status_idx").on(t.doctorId, t.queueDate, t.status),
]);

export const encounters = pgTable("encounters", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  status: text("status").notNull().default("draft"),
  visitType: text("visit_type").notNull().default("consultation"),
  chiefComplaint: text("chief_complaint"),
  symptoms: text("symptoms"),
  examination: text("examination"),
  treatmentPlan: text("treatment_plan"),
  followUpNotes: text("follow_up_notes"),
  followUpOn: date("follow_up_on"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedBy: uuid("finalized_by").references(() => users.id),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (t) => [
  index("encounters_patient_idx").on(t.patientId),
  index("encounters_doctor_idx").on(t.doctorId, t.status),
]);

export const vitals = pgTable("vitals", {
  id: uuid("id").defaultRandom().primaryKey(),
  encounterId: uuid("encounter_id").notNull().references(() => encounters.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  recordedBy: uuid("recorded_by").references(() => users.id),
  temperatureC: text("temperature_c"),
  pulseBpm: integer("pulse_bpm"),
  respiratoryRate: integer("respiratory_rate"),
  systolicMmHg: integer("systolic_mmhg"),
  diastolicMmHg: integer("diastolic_mmhg"),
  spo2: integer("spo2"),
  weightKg: text("weight_kg"),
  heightCm: text("height_cm"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("vitals_encounter_idx").on(t.encounterId),
]);

export const diagnoses = pgTable("diagnoses", {
  id: uuid("id").defaultRandom().primaryKey(),
  encounterId: uuid("encounter_id").notNull().references(() => encounters.id),
  code: text("code"),
  description: text("description").notNull(),
  type: text("type").notNull().default("primary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("diagnoses_encounter_idx").on(t.encounterId),
]);

export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  prescriptionNo: text("prescription_no").notNull(),
  encounterId: uuid("encounter_id").notNull().references(() => encounters.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  uniqueIndex("prescriptions_no_uidx").on(t.prescriptionNo),
  index("prescriptions_patient_idx").on(t.patientId),
]);

export const prescriptionItems = pgTable("prescription_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  prescriptionId: uuid("prescription_id").notNull().references(() => prescriptions.id),
  medicineName: text("medicine_name").notNull(),
  medicineId: uuid("medicine_id"),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration").notNull(),
  route: text("route").notNull().default("oral"),
  quantity: integer("quantity").notNull().default(1),
  instructions: text("instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
