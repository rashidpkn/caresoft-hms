"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Card, Label, Select, Textarea } from "@/components/ui";

type Doctor = { id: string; fullName: string; userId: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

export default function ConsultationsPage() {
  const router = useRouter();
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("doctors") });
  const patients = useQuery({ queryKey: ["patients", ""], queryFn: () => api<{ items: Patient[] }>("patients?q=") });
  const [form, setForm] = useState({ patientId: "", doctorId: "", chiefComplaint: "" });
  const [msg, setMsg] = useState("");

  async function start(e: FormEvent) {
    e.preventDefault();
    try {
      const enc = await api<{ id: string }>("encounters", { method: "POST", body: JSON.stringify(form) });
      router.push(`/consultations/${enc.id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Start consultation</h1>
      <Card className="mt-4">
        <form onSubmit={start} className="space-y-3">
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
          <div>
            <Label>Chief complaint</Label>
            <Textarea value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} />
          </div>
          {msg ? <p className="text-sm text-red-700">{msg}</p> : null}
          <Button type="submit">Open encounter</Button>
        </form>
      </Card>
    </div>
  );
}
