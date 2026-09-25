import { apiRoute, json, parseSearch, readJson } from "@/server/http";
import { clientIp } from "@/server/auth/request";
import { changePassword, listActiveSessions, login, logout, logoutAll } from "@/server/services/auth-service";
import {
  createUser,
  listDepartments,
  listDesignations,
  listDoctors,
  listRoles,
  listUsers,
  resetPassword,
  setUserActive,
  updateUser,
  upsertDepartment,
  upsertDesignation,
  upsertDoctor,
} from "@/server/services/user-service";
import { getPatient, registerPatient, searchPatients, updatePatient } from "@/server/services/patient-service";
import {
  availableSlots,
  bookAppointment,
  checkIn,
  listAppointments,
  listQueue,
  listSchedules,
  myDoctorProfile,
  rescheduleAppointment,
  saveSchedules,
  setQueueStatus,
  updateAppointmentStatus,
} from "@/server/services/appointment-service";
import {
  addPrescription,
  finalizeEncounter,
  getEncounter,
  patientTimeline,
  recordVitals,
  startEncounter,
  updateEncounter,
} from "@/server/services/encounter-service";
import {
  adjustStock,
  dispensableStock,
  getSaleDetail,
  listBatches,
  listCategories,
  listMedicines,
  listMovements,
  listPurchases,
  listSales,
  listSuppliers,
  receivePurchase,
  saleReturn,
  sellMedicines,
  upsertCategory,
  upsertMedicine,
  upsertSupplier,
} from "@/server/services/pharmacy-service";
import {
  cancelInvoice,
  createInvoice,
  getInvoice,
  listInvoices,
  listServices,
  recordPayment,
  refundInvoice,
  upsertService,
} from "@/server/services/billing-service";
import {
  collectSample,
  createLabOrder,
  enterResult,
  getLabOrder,
  listLabCategories,
  listLabOrders,
  listLabTests,
  receiveSample,
  upsertLabCategory,
  upsertLabTest,
  verifyResult,
} from "@/server/services/lab-service";
import { reportAppointments, reportAudit, reportConsultations, reportLab, reportPatients, reportPharmacyStock, reportRevenue, searchAudit } from "@/server/services/report-service";
import { dashboardFor, labWorklist } from "@/server/services/dashboard-service";
import { createBackup, listBackups, restoreBackup } from "@/server/services/backup-service";
import { getSettings, healthCheck, setSetting } from "@/server/services/health-service";
import { ALL_PERMISSIONS } from "@/server/auth/permissions";
import { badRequest, notFound } from "@/server/errors";
import { AppError } from "@/server/errors";

function pathOf(req: Request): string[] {
  const url = new URL(req.url);
  const raw = url.pathname.replace(/^\/api\/?/, "");
  return raw.split("/").filter(Boolean);
}

export async function dispatch(req: Request): Promise<Response> {
  const parts = pathOf(req);
  const key = `${req.method}:${parts.join("/")}`;

  try {
    if (key === "POST:auth/login") {
      const body = await readJson(req);
      const result = await login(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return json({ ok: true, data: { user: result.user, csrfToken: result.csrfToken } }, {
        headers: { "Set-Cookie": result.setCookie },
      });
    }
  } catch (e) {
    const { handleError } = await import("@/server/http");
    return handleError(e);
  }

  const map: Record<string, ReturnType<typeof apiRoute>> = {
    "GET:auth/me": apiRoute({ permission: undefined, csrf: false }, async (_req, ctx) => ({
      user: ctx!.user,
      csrfToken: ctx!.csrfToken,
    })),
    "POST:auth/logout": apiRoute({}, async (_req, ctx) => {
      const result = await logout(ctx!);
      return json({ ok: true, data: { ok: true } }, { headers: { "Set-Cookie": result.setCookie } });
    }),
    "POST:auth/password": apiRoute({}, async (req, ctx) => {
      const body = await readJson<{ currentPassword: string; newPassword: string }>(req);
      await changePassword(ctx!, body);
      return { ok: true };
    }),
    "GET:auth/sessions": apiRoute({ csrf: false }, async (_req, ctx) => listActiveSessions(ctx!.user.id)),
    "POST:auth/sessions/revoke": apiRoute({ permission: "user.edit" }, async (req, ctx) => {
      const body = await readJson<{ userId: string }>(req);
      await logoutAll(ctx!, body.userId);
      return { ok: true };
    }),
    "GET:users": apiRoute({ permission: "user.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return listUsers({ q: q.get("q") ?? undefined, role: q.get("role") ?? undefined, active: q.get("active") ?? undefined, page: Number(q.get("page") ?? 1) });
    }),
    "POST:users": apiRoute({ permission: "user.create" }, async (req, ctx) => createUser(ctx!, await readJson(req))),
    "GET:roles": apiRoute({ permission: "user.view", csrf: false }, async () => ({ roles: await listRoles(), permissions: ALL_PERMISSIONS })),
    "GET:departments": apiRoute({ auth: true, csrf: false }, async () => listDepartments()),
    "POST:departments": apiRoute({ permission: "department.manage" }, async (req, ctx) => upsertDepartment(ctx!, await readJson(req))),
    "GET:designations": apiRoute({ auth: true, csrf: false }, async () => listDesignations()),
    "POST:designations": apiRoute({ permission: "department.manage" }, async (req, ctx) => upsertDesignation(ctx!, await readJson(req))),
    "GET:doctors": apiRoute({ auth: true, csrf: false }, async () => listDoctors()),
    "POST:doctors": apiRoute({ permission: "doctor.manage" }, async (req, ctx) => upsertDoctor(ctx!, await readJson(req))),
    "GET:patients": apiRoute({ permission: "patient.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return searchPatients(q.get("q") ?? "", Number(q.get("page") ?? 1));
    }),
    "POST:patients": apiRoute({ permission: "patient.create" }, async (req, ctx) => registerPatient(ctx!, await readJson(req))),
    "GET:appointments": apiRoute({ permission: "appointment.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return listAppointments({ doctorId: q.get("doctorId") ?? undefined, date: q.get("date") ?? undefined, patientId: q.get("patientId") ?? undefined });
    }),
    "POST:appointments": apiRoute({ permission: "appointment.create" }, async (req, ctx) => bookAppointment(ctx!, await readJson(req))),
    "POST:appointments/checkin": apiRoute({ permission: "appointment.checkin" }, async (req, ctx) => {
      const body = await readJson<{ appointmentId: string }>(req);
      return checkIn(ctx!, body.appointmentId);
    }),
    "GET:pharmacy/medicines": apiRoute({ permission: "pharmacy.medicine.view", csrf: false }, async (req) => listMedicines(parseSearch(req).get("q") ?? undefined)),
    "POST:pharmacy/medicines": apiRoute({ permission: "pharmacy.medicine.manage" }, async (req, ctx) => upsertMedicine(ctx!, await readJson(req))),
    "GET:pharmacy/categories": apiRoute({ permission: "pharmacy.medicine.view", csrf: false }, async () => listCategories()),
    "POST:pharmacy/categories": apiRoute({ permission: "pharmacy.medicine.manage" }, async (req, ctx) => {
      const body = await readJson<{ name: string; id?: string }>(req);
      return upsertCategory(ctx!, body.name, body.id);
    }),
    "GET:pharmacy/suppliers": apiRoute({ permission: "inventory.view", csrf: false }, async () => listSuppliers()),
    "POST:pharmacy/suppliers": apiRoute({ permission: "supplier.manage" }, async (req, ctx) => upsertSupplier(ctx!, await readJson(req))),
    "GET:pharmacy/batches": apiRoute({ permission: "pharmacy.batch.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return listBatches({
        medicineId: q.get("medicineId") ?? undefined,
        expiringDays: q.get("expiringDays") ? Number(q.get("expiringDays")) : undefined,
        lowStock: q.get("lowStock") === "true",
      });
    }),
    "POST:pharmacy/purchases": apiRoute({ permission: "pharmacy.purchase.create" }, async (req, ctx) => receivePurchase(ctx!, await readJson(req))),
    "GET:pharmacy/purchases": apiRoute({ permission: "pharmacy.purchase.view", csrf: false }, async () => listPurchases()),
    "POST:pharmacy/sales": apiRoute({ permission: "pharmacy.sale.create" }, async (req, ctx) => sellMedicines(ctx!, await readJson(req))),
    "POST:pharmacy/returns": apiRoute({ permission: "pharmacy.sale.refund" }, async (req, ctx) => {
      const body = await readJson<{ invoiceId: string; items: { batchId: string; quantity: number }[]; reason: string }>(req);
      return saleReturn(ctx!, body.invoiceId, body.items, body.reason);
    }),
    "POST:pharmacy/adjust": apiRoute({ permission: "inventory.adjust" }, async (req, ctx) => {
      const body = await readJson<{ batchId: string; quantityDelta: number; reason: string }>(req);
      return adjustStock(ctx!, body.batchId, body.quantityDelta, body.reason);
    }),
    "GET:pharmacy/movements": apiRoute({ permission: "inventory.view", csrf: false }, async (req) => listMovements(parseSearch(req).get("batchId") ?? undefined)),
    "GET:billing/invoices": apiRoute({ permission: "billing.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return listInvoices({ patientId: q.get("patientId") ?? undefined, status: q.get("status") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
    }),
    "POST:billing/invoices": apiRoute({ permission: "billing.create" }, async (req, ctx) => createInvoice(ctx!, await readJson(req))),
    "POST:billing/payments": apiRoute({ permission: "billing.pay" }, async (req, ctx) => recordPayment(ctx!, await readJson(req))),
    "POST:billing/refunds": apiRoute({ permission: "billing.refund" }, async (req, ctx) => refundInvoice(ctx!, await readJson(req))),
    "POST:billing/cancel": apiRoute({ permission: "billing.cancel" }, async (req, ctx) => {
      const body = await readJson<{ invoiceId: string; reason: string }>(req);
      return cancelInvoice(ctx!, body.invoiceId, body.reason);
    }),
    "GET:billing/services": apiRoute({ permission: "billing.view", csrf: false }, async () => listServices()),
    "POST:billing/services": apiRoute({ permission: "settings.manage" }, async (req, ctx) => upsertService(ctx!, await readJson(req))),
    "GET:lab/tests": apiRoute({ permission: "lab.order.view", csrf: false }, async () => listLabTests()),
    "POST:lab/tests": apiRoute({ permission: "lab.catalogue.manage" }, async (req, ctx) => upsertLabTest(ctx!, await readJson(req))),
    "GET:lab/categories": apiRoute({ permission: "lab.order.view", csrf: false }, async () => listLabCategories()),
    "POST:lab/categories": apiRoute({ permission: "lab.catalogue.manage" }, async (req) => {
      const body = await readJson<{ name: string; id?: string }>(req);
      return upsertLabCategory(body.name, body.id);
    }),
    "GET:lab/orders": apiRoute({ permission: "lab.order.view", csrf: false }, async (req) => listLabOrders(parseSearch(req).get("status") ?? undefined)),
    "POST:lab/orders": apiRoute({ permission: "lab.order.create" }, async (req, ctx) => createLabOrder(ctx!, await readJson(req))),
    "POST:lab/samples": apiRoute({ permission: "lab.sample.collect" }, async (req, ctx) => {
      const body = await readJson<{ orderId: string; specimenType: string; notes?: string }>(req);
      return collectSample(ctx!, body.orderId, body.specimenType, body.notes);
    }),
    "POST:lab/samples/receive": apiRoute({ permission: "lab.result.enter" }, async (req, ctx) => {
      const body = await readJson<{ sampleId: string }>(req);
      return receiveSample(ctx!, body.sampleId);
    }),
    "POST:lab/results": apiRoute({ permission: "lab.result.enter" }, async (req, ctx) => {
      const body = await readJson<{ orderItemId: string; value: string; flag?: string; notes?: string; sampleId?: string }>(req);
      return enterResult(ctx!, body.orderItemId, body.value, body.flag, body.notes, body.sampleId);
    }),
    "POST:lab/results/verify": apiRoute({ permission: "lab.result.verify" }, async (req, ctx) => {
      const body = await readJson<{ resultId: string }>(req);
      return verifyResult(ctx!, body.resultId);
    }),
    "GET:settings": apiRoute({ permission: "settings.manage", csrf: false }, async () => getSettings()),
    "POST:settings": apiRoute({ permission: "settings.manage" }, async (req, ctx) => {
      const body = await readJson<{ key: string; value: unknown }>(req);
      return setSetting(body.key, body.value, ctx!.user.id);
    }),
    "GET:health": apiRoute({ permission: "health.view", csrf: false }, async () => healthCheck()),
    "GET:health/public": apiRoute({ auth: false, csrf: false }, async () => ({ status: "ok", lan: true })),
    "GET:backups": apiRoute({ permission: "backup.manage", csrf: false }, async () => listBackups()),
    "POST:backups": apiRoute({ permission: "backup.manage" }, async (_req, ctx) => createBackup(ctx!, "manual")),
    "POST:backups/restore": apiRoute({ permission: "backup.manage" }, async (req, ctx) => {
      const body = await readJson<{ filename: string; confirm: string }>(req);
      return restoreBackup(ctx!, body.filename, body.confirm);
    }),
    "GET:reports/patients": apiRoute({ permission: "reports.clinical", csrf: false }, async (req) => reportPatients(...range(req))),
    "GET:reports/appointments": apiRoute({ permission: "reports.clinical", csrf: false }, async (req) => reportAppointments(...range(req))),
    "GET:reports/consultations": apiRoute({ permission: "reports.clinical", csrf: false }, async (req) => reportConsultations(...range(req))),
    "GET:reports/pharmacy": apiRoute({ permission: "reports.pharmacy", csrf: false }, async () => reportPharmacyStock()),
    "GET:reports/lab": apiRoute({ permission: "reports.lab", csrf: false }, async (req) => reportLab(...range(req))),
    "GET:reports/audit": apiRoute({ permission: "reports.audit", csrf: false }, async (req) => reportAudit(...range(req))),
    "GET:reports/revenue": apiRoute({ permission: "reports.financial", csrf: false }, async (req) => reportRevenue(...range(req))),
    "GET:audit": apiRoute({ permission: "audit.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      return searchAudit({ q: q.get("q") ?? undefined, module: q.get("module") ?? undefined });
    }),
    "GET:dashboard": apiRoute({ permission: "dashboard.view", csrf: false }, async (_req, ctx) => dashboardFor(ctx!.user)),
    "GET:lab/worklist": apiRoute({ permission: "lab.order.view", csrf: false }, async (_req, ctx) => labWorklist(ctx!.user)),
    "GET:doctors/me": apiRoute({ auth: true, csrf: false }, async (_req, ctx) => myDoctorProfile(ctx!.user.id)),
    "GET:appointments/slots": apiRoute({ permission: "appointment.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      const doctorId = q.get("doctorId");
      const date = q.get("date");
      if (!doctorId || !date) throw badRequest("doctorId and date are required");
      return availableSlots(doctorId, date);
    }),
    "GET:pharmacy/stock": apiRoute({ permission: "pharmacy.sale.create", csrf: false }, async (req) => dispensableStock(parseSearch(req).get("q") ?? undefined)),
    "GET:pharmacy/sales": apiRoute({ permission: "pharmacy.sale.create", csrf: false }, async () => listSales()),
    "POST:encounters": apiRoute({ permission: "consultation.create" }, async (req, ctx) => startEncounter(ctx!, await readJson(req))),
    "POST:encounters/vitals": apiRoute({ permission: "vitals.record" }, async (req, ctx) => recordVitals(ctx!, await readJson(req))),
    "POST:encounters/prescriptions": apiRoute({ permission: "prescription.create" }, async (req, ctx) => addPrescription(ctx!, await readJson(req))),
    "POST:encounters/finalize": apiRoute({ permission: "consultation.finalize" }, async (req, ctx) => {
      const body = await readJson<{ id: string }>(req);
      return finalizeEncounter(ctx!, body.id);
    }),
  };

  const handler = map[key];
  if (handler) return handler(req);

  // parameterized
  if (parts[0] === "users" && parts[1] && req.method === "PATCH") {
    return apiRoute({ permission: "user.edit" }, async (req, ctx) => updateUser(ctx!, parts[1], await readJson(req)))(req);
  }
  if (parts[0] === "users" && parts[2] === "active" && req.method === "POST") {
    return apiRoute({ permission: "user.disable" }, async (req, ctx) => {
      const body = await readJson<{ isActive: boolean }>(req);
      return setUserActive(ctx!, parts[1], body.isActive);
    })(req);
  }
  if (parts[0] === "users" && parts[2] === "password" && req.method === "POST") {
    return apiRoute({ permission: "user.reset_password" }, async (req, ctx) => {
      const body = await readJson<{ password: string }>(req);
      return resetPassword(ctx!, parts[1], body.password);
    })(req);
  }
  if (parts[0] === "patients" && parts[1] && req.method === "GET") {
    if (parts[2] === "timeline") {
      return apiRoute({ permission: "patient.view", csrf: false }, async () => patientTimeline(parts[1]))(req);
    }
    return apiRoute({ permission: "patient.view", csrf: false }, async () => getPatient(parts[1]))(req);
  }
  if (parts[0] === "patients" && parts[1] && req.method === "PATCH") {
    return apiRoute({ permission: "patient.edit" }, async (req, ctx) => updatePatient(ctx!, parts[1], await readJson(req)))(req);
  }
  if (parts[0] === "appointments" && parts[2] === "status" && req.method === "POST") {
    return apiRoute({ permission: "appointment.cancel" }, async (req, ctx) => {
      const body = await readJson<{ status: string; reason?: string }>(req);
      return updateAppointmentStatus(ctx!, parts[1], body.status, body.reason);
    })(req);
  }
  if (parts[0] === "appointments" && parts[2] === "reschedule" && req.method === "POST") {
    return apiRoute({ permission: "appointment.reschedule" }, async (req, ctx) => {
      const body = await readJson<{ scheduledAt: string }>(req);
      return rescheduleAppointment(ctx!, parts[1], body.scheduledAt);
    })(req);
  }
  if (parts[0] === "queue" && req.method === "GET") {
    return apiRoute({ permission: "appointment.view", csrf: false }, async (req) => {
      const q = parseSearch(req);
      const doctorId = q.get("doctorId");
      const date = q.get("date");
      if (!doctorId || !date) throw badRequest("doctorId and date required");
      return listQueue(doctorId, date);
    })(req);
  }
  if (parts[0] === "queue" && parts[2] === "status" && req.method === "POST") {
    return apiRoute({ permission: "queue.manage" }, async (req, ctx) => {
      const body = await readJson<{ status: "waiting" | "called" | "in_consult" | "done" | "skipped" }>(req);
      return setQueueStatus(ctx!, parts[1], body.status);
    })(req);
  }
  if (parts[0] === "doctors" && parts[2] === "schedules" && req.method === "GET") {
    return apiRoute({ permission: "appointment.view", csrf: false }, async () => listSchedules(parts[1]))(req);
  }
  if (parts[0] === "doctors" && parts[2] === "schedules" && req.method === "PUT") {
    return apiRoute({ permission: "doctor.manage" }, async (req, ctx) => {
      const body = await readJson<{ items: { weekday: number; startTime: string; endTime: string; slotMinutes: number }[] }>(req);
      return saveSchedules(ctx!, parts[1], body.items);
    })(req);
  }
  if (parts[0] === "encounters" && parts[1] && req.method === "GET") {
    return apiRoute({ permission: "consultation.view", csrf: false }, async () => getEncounter(parts[1]))(req);
  }
  if (parts[0] === "encounters" && parts[1] && req.method === "PATCH") {
    return apiRoute({ permission: "consultation.create" }, async (req, ctx) => updateEncounter(ctx!, parts[1], await readJson(req)))(req);
  }
  if (parts[0] === "billing" && parts[1] === "invoices" && parts[2] && req.method === "GET") {
    return apiRoute({ permission: "billing.view", csrf: false }, async () => getInvoice(parts[2]))(req);
  }
  if (parts[0] === "lab" && parts[1] === "orders" && parts[2] && req.method === "GET") {
    return apiRoute({ permission: "lab.order.view", csrf: false }, async () => getLabOrder(parts[2]))(req);
  }
  if (parts[0] === "pharmacy" && parts[1] === "sales" && parts[2] && req.method === "GET") {
    return apiRoute({ permission: "pharmacy.sale.create", csrf: false }, async () => getSaleDetail(parts[2]))(req);
  }

  if (key === "GET:health/public") {
    return json({ ok: true, data: { status: "ok", lan: true } });
  }

  throw notFound("Unknown API route");
}

function range(req: Request): [Date, Date] {
  const q = parseSearch(req);
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(Date.now() - 30 * 86400000);
  const to = q.get("to") ? new Date(q.get("to")!) : new Date();
  return [from, to];
}

export { AppError };
