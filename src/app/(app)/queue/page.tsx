"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Select } from "@/components/ui";
import { todayISODate } from "@/lib/utils";

type Doctor = { id: string; fullName: string };
type QItem = { id: string; tokenNumber: number; status: string; patientName: string; patientMrn: string; appointmentId: string };

export default function QueuePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISODate());
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("doctors") });
  const [doctorId, setDoctorId] = useState("");
  const list = useQuery({
    queryKey: ["queue", doctorId, date],
    queryFn: () => api<QItem[]>(`queue?doctorId=${doctorId}&date=${date}`),
    enabled: Boolean(doctorId),
  });

  async function setStatus(id: string, status: string) {
    await api(`queue/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    qc.invalidateQueries({ queryKey: ["queue"] });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Doctor queue</h1>
      <div className="mt-3 flex gap-3">
        <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="max-w-xs">
          <option value="">Select doctor</option>
          {(doctors.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </Select>
        <input type="date" className="rounded-md border px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b text-slate-500"><tr><th className="py-2">Token</th><th>Patient</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {(list.data ?? []).map((q) => (
            <tr key={q.id} className="border-b">
              <td className="py-2 font-semibold">{q.tokenNumber}</td>
              <td>{q.patientName} ({q.patientMrn})</td>
              <td>{q.status}</td>
              <td className="space-x-2">
                <Button className="px-2 py-1 text-xs" onClick={() => setStatus(q.id, "called")}>Call</Button>
                <Button className="px-2 py-1 text-xs" onClick={() => setStatus(q.id, "in_consult")}>Start</Button>
                <Button className="px-2 py-1 text-xs" onClick={() => setStatus(q.id, "done")}>Done</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
