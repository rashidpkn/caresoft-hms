"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { todayISODate } from "@/lib/utils";

type Appt = { id: string; scheduledAt: string; status: string; patientName: string; patientMrn: string; doctorName: string };
type Doctor = { id: string; fullName: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISODate());
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("doctors") });
  const patients = useQuery({ queryKey: ["patients", ""], queryFn: () => api<{ items: Patient[] }>("patients?q=") });
  const list = useQuery({ queryKey: ["appointments", date], queryFn: () => api<Appt[]>(`appointments?date=${date}`) });
  const [form, setForm] = useState({ patientId: "", doctorId: "", scheduledAt: `${date}T09:00:00.000Z`, reason: "" });
  const [msg, setMsg] = useState("");

  async function book(e: FormEvent) {
    e.preventDefault();
    try {
      await api("appointments", { method: "POST", body: JSON.stringify(form) });
      setMsg("Booked");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <Label className="mt-3">Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Time</th><th>Patient</th><th>Doctor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(list.data ?? []).map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2">{new Date(a.scheduledAt).toLocaleTimeString()}</td>
                <td>{a.patientName} ({a.patientMrn})</td>
                <td>{a.doctorName}</td>
                <td>{a.status}</td>
                <td>
                  {a.status === "scheduled" ? (
                    <Button className="px-2 py-1 text-xs" onClick={async () => {
                      await api("appointments/checkin", { method: "POST", body: JSON.stringify({ appointmentId: a.id }) });
                      qc.invalidateQueries({ queryKey: ["appointments"] });
                    }}>Check in</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">Book</h2>
        <form onSubmit={book} className="mt-3 space-y-3">
          <div>
            <Label>Patient</Label>
            <Select value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} required>
              <option value="">Select</option>
              {(patients.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.mrn} {p.firstName} {p.lastName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Doctor</Label>
            <Select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })} required>
              <option value="">Select</option>
              {(doctors.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
            </Select>
          </div>
          <div><Label>Time (ISO)</Label><Input value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} required /></div>
          <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Book appointment</Button>
        </form>
      </Card>
    </div>
  );
}
