"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, SecondaryButton, Select } from "@/components/ui";
import { Empty, ErrorNote, Loading, SuccessNote } from "@/components/data-states";
import { useSession } from "@/lib/use-session";
import { formatMoney, todayISODate } from "@/lib/utils";

type Appointment = {
  id: string;
  scheduledAt: string;
  status: string;
  visitType: string;
  reason: string | null;
  patientId: string;
  patientMrn: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
};
type Doctor = { id: string; fullName: string; specialization: string; consultationFeeCents: number; followUpFeeCents: number };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };
type Slot = { startsAt: string; label: string; taken: boolean };

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [date, setDate] = useState(todayISODate());
  const [patientQuery, setPatientQuery] = useState("");
  const [form, setForm] = useState({ patientId: "", doctorId: "", startsAt: "", visitType: "consultation", reason: "" });
  const [notice, setNotice] = useState("");

  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("doctors") });
  const patients = useQuery({
    queryKey: ["patients", patientQuery],
    queryFn: () => api<{ items: Patient[] }>(`patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: can("patient.view"),
  });
  const appointments = useQuery({ queryKey: ["appointments", date], queryFn: () => api<Appointment[]>(`appointments?date=${date}`) });
  const slots = useQuery({
    queryKey: ["slots", form.doctorId, date],
    queryFn: () => api<Slot[]>(`appointments/slots?doctorId=${form.doctorId}&date=${date}`),
    enabled: Boolean(form.doctorId),
  });

  const book = useMutation({
    mutationFn: () =>
      api<Appointment>("appointments", {
        method: "POST",
        body: JSON.stringify({
          patientId: form.patientId,
          doctorId: form.doctorId,
          scheduledAt: form.startsAt,
          visitType: form.visitType,
          reason: form.reason || undefined,
        }),
      }),
    onSuccess: () => {
      setNotice("Appointment booked.");
      setForm((f) => ({ ...f, startsAt: "", reason: "" }));
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const checkIn = useMutation({
    mutationFn: (appointmentId: string) =>
      api<{ queue: { tokenNumber: number } }>("appointments/checkin", { method: "POST", body: JSON.stringify({ appointmentId }) }),
    onSuccess: (data) => {
      setNotice(`Checked in. Token #${data.queue?.tokenNumber ?? "-"}.`);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`appointments/${id}/status`, { method: "POST", body: JSON.stringify({ status: "cancelled", reason }) }),
    onSuccess: () => {
      setNotice("Appointment cancelled.");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const collectFee = useMutation({
    mutationFn: async (appt: Appointment) => {
      const doctor = doctors.data?.find((d) => d.id === appt.doctorId);
      const feeCents = appt.visitType === "follow_up" ? doctor?.followUpFeeCents ?? 0 : doctor?.consultationFeeCents ?? 0;
      if (!feeCents) throw new Error("No consultation fee is configured for this doctor");
      return api<{ id: string; invoiceNo: string; totalCents: number }>("billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientId: appt.patientId,
          source: "consultation",
          items: [
            {
              itemType: "consultation",
              referenceId: appt.doctorId,
              description: `${appt.visitType === "follow_up" ? "Follow-up" : "Consultation"} — ${appt.doctorName}`,
              quantity: 1,
              unitPriceCents: feeCents,
            },
          ],
        }),
      });
    },
    onSuccess: (invoice) => {
      setNotice(`Invoice ${invoice.invoiceNo} created for ${formatMoney(invoice.totalCents)}.`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    book.mutate();
  }

  const freeSlots = (slots.data ?? []).filter((s) => !s.taken);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Front desk</h1>
            <p className="text-sm text-slate-600">Book, check in, cancel, and collect the consultation fee.</p>
          </div>
          <div>
            <Label htmlFor="board-date">Date</Label>
            <Input id="board-date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <SuccessNote message={notice} />
        <ErrorNote error={checkIn.error || cancel.error || collectFee.error} />

        {appointments.isLoading ? (
          <Loading label="Loading today's list…" />
        ) : (appointments.data ?? []).length === 0 ? (
          <Empty title="No appointments for this date" hint="Use the booking panel to add one." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2">Time</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Type</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(appointments.data ?? []).map((a) => (
                <tr key={a.id} className="border-b align-middle">
                  <td className="py-2 font-medium">{new Date(a.scheduledAt).toISOString().slice(11, 16)}</td>
                  <td>
                    <Link className="text-teal-800 hover:underline" href={`/patients/${a.patientId}`}>
                      {a.patientName}
                    </Link>
                    <div className="text-xs text-slate-500">{a.patientMrn}</div>
                  </td>
                  <td>{a.doctorName}</td>
                  <td>{a.visitType.replace("_", " ")}</td>
                  <td>{a.status}</td>
                  <td className="space-x-2 py-2 text-right">
                    {a.status === "scheduled" && can("appointment.checkin") ? (
                      <Button className="px-2 py-1 text-xs" disabled={checkIn.isPending} onClick={() => checkIn.mutate(a.id)}>
                        Check in
                      </Button>
                    ) : null}
                    {can("billing.create") ? (
                      <SecondaryButton className="px-2 py-1 text-xs" disabled={collectFee.isPending} onClick={() => collectFee.mutate(a)}>
                        Bill fee
                      </SecondaryButton>
                    ) : null}
                    {["scheduled", "checked_in"].includes(a.status) && can("appointment.cancel") ? (
                      <SecondaryButton
                        className="px-2 py-1 text-xs"
                        onClick={() => {
                          const reason = window.prompt("Reason for cancellation?");
                          if (reason) cancel.mutate({ id: a.id, reason });
                        }}
                      >
                        Cancel
                      </SecondaryButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {can("appointment.create") ? (
        <Card>
          <h2 className="font-semibold">Book appointment</h2>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <div>
              <Label htmlFor="patient-search">Find patient</Label>
              <Input id="patient-search" placeholder="MRN or name" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select id="patient" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} required>
                <option value="">Select patient</option>
                {(patients.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mrn} · {p.firstName} {p.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="doctor">Doctor</Label>
              <Select
                id="doctor"
                value={form.doctorId}
                onChange={(e) => setForm({ ...form, doctorId: e.target.value, startsAt: "" })}
                required
              >
                <option value="">Select doctor</option>
                {(doctors.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} · {d.specialization}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="visit">Visit type</Label>
              <Select id="visit" value={form.visitType} onChange={(e) => setForm({ ...form, visitType: e.target.value })}>
                <option value="consultation">Consultation</option>
                <option value="follow_up">Follow-up</option>
                <option value="procedure">Procedure</option>
              </Select>
            </div>
            <div>
              <Label>Available slots on {date}</Label>
              {!form.doctorId ? (
                <p className="text-sm text-slate-500">Pick a doctor to see free slots.</p>
              ) : slots.isLoading ? (
                <p className="text-sm text-slate-500">Loading slots…</p>
              ) : freeSlots.length === 0 ? (
                <p className="text-sm text-slate-500">No free slots. The doctor may not work this day.</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {freeSlots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setForm({ ...form, startsAt: s.startsAt })}
                      className={`rounded border px-2 py-1 text-sm ${
                        form.startsAt === s.startsAt ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white hover:bg-slate-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Fever, review, etc." />
            </div>
            <ErrorNote error={book.error} />
            <Button type="submit" disabled={!form.patientId || !form.doctorId || !form.startsAt || book.isPending}>
              {book.isPending ? "Booking…" : "Book appointment"}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
