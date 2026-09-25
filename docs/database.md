# Database

PostgreSQL 16. ORM: Drizzle. Money is stored as integer cents (`*_cents`). GST/tax uses integer basis points (`*_bps`, 10000 = 100%).

## Important tables

Identity: `users`, `roles`, `permissions`, `role_permissions`, `user_permission_overrides`, `sessions`, `departments`, `designations`.

Clinical: `patients`, `patient_contacts`, `patient_identifiers`, `doctors`, `doctor_schedules`, `appointments`, `queues`, `encounters`, `vitals`, `diagnoses`, `prescriptions`, `prescription_items`.

Pharmacy: `medicines`, `medicine_categories`, `medicine_batches`, `suppliers`, `purchases`, `purchase_items`, `inventory_movements`.

Billing: `billable_services`, `invoices`, `invoice_items`, `payments`, `refunds`.

Lab: `lab_categories`, `lab_tests`, `lab_orders`, `lab_order_items`, `lab_samples`, `lab_results`.

System: `sequences`, `system_settings`, `audit_logs`, `backup_runs`, `notifications`.

## Sequences

Document numbers (MRN, INV, PAY, RX, LAB, SMP, PUR, RFD) come from `sequences` using `SELECT … FOR UPDATE` so concurrent users cannot mint the same number.

## Stock

Pharmacy sales lock the batch row (`FOR UPDATE`) and update with `quantity_on_hand >= requested`. Concurrent oversell fails instead of going negative.

## Soft delete / identity

Users are disabled, not deleted. Patients are deactivated with `is_active`. Encounters become read-only when `status = finalized`.
