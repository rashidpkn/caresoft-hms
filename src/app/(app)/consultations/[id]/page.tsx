"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";

type Encounter = {
  encounter: { id: string; status: string; chiefComplaint: string | null; symptoms: string | null; examination: string | null; treatmentPlan: string | null; patientId: string };
  vitals: { id: string; pulseBpm: number | null; systolicMmHg: number | null; recordedAt: string }[];
  diagnoses: { id: string; description: string }[];
  prescriptions: { id: string; prescriptionNo: string }[];
};

export default function EncounterPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["encounter", id], queryFn: () => api<Encounter>(`encounters/${id}`) });
  const [notes, setNotes] = useState({ symptoms: "", examination: "", treatmentPlan: "", diagnosis: "" });
  const [rx, setRx] = useState({ medicineName: "Paracetamol 500mg", dosage: "1 tablet", frequency: "TID", duration: "5 days" });
  const [msg, setMsg] = useState("");
  const enc = q.data?.encounter;
  const locked = enc?.status === "finalized";

  async function save() {
    await api(`encounters/${id}`, { method: "PATCH", body: JSON.stringify({
      symptoms: notes.symptoms, examination: notes.examination, treatmentPlan: notes.treatmentPlan,
      diagnoses: notes.diagnosis ? [{ description: notes.diagnosis, type: "primary" }] : [],
    }) });
    qc.invalidateQueries({ queryKey: ["encounter", id] });
    setMsg("Saved");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Encounter</h1>
      <p className="text-sm text-slate-600">Status: {enc?.status}</p>
      {enc?.chiefComplaint ? <p>Chief complaint: {enc.chiefComplaint}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Label>Symptoms</Label>
          <Textarea disabled={locked} value={notes.symptoms} onChange={(e) => setNotes({ ...notes, symptoms: e.target.value })} />
          <Label className="mt-3">Examination</Label>
          <Textarea disabled={locked} value={notes.examination} onChange={(e) => setNotes({ ...notes, examination: e.target.value })} />
          <Label className="mt-3">Treatment plan</Label>
          <Textarea disabled={locked} value={notes.treatmentPlan} onChange={(e) => setNotes({ ...notes, treatmentPlan: e.target.value })} />
          <Label className="mt-3">Diagnosis</Label>
          <Input disabled={locked} value={notes.diagnosis} onChange={(e) => setNotes({ ...notes, diagnosis: e.target.value })} />
          {!locked ? <Button className="mt-3" onClick={save}>Save draft</Button> : null}
        </Card>
        <Card>
          <h2 className="font-semibold">Vitals</h2>
          <Button className="mt-2" disabled={locked} onClick={async () => {
            if (!enc) return;
            await api("encounters/vitals", { method: "POST", body: JSON.stringify({ encounterId: enc.id, patientId: enc.patientId, pulseBpm: 78, systolicMmHg: 120, diastolicMmHg: 80 }) });
            qc.invalidateQueries({ queryKey: ["encounter", id] });
          }}>Record sample vitals</Button>
          <ul className="mt-2 text-sm">{q.data?.vitals.map((v) => <li key={v.id}>{new Date(v.recordedAt).toLocaleString()} · pulse {v.pulseBpm} · BP {v.systolicMmHg}</li>)}</ul>
          <h2 className="mt-4 font-semibold">Prescription</h2>
          <div className="space-y-2">
            <Input disabled={locked} value={rx.medicineName} onChange={(e) => setRx({ ...rx, medicineName: e.target.value })} />
            <Input disabled={locked} value={rx.dosage} onChange={(e) => setRx({ ...rx, dosage: e.target.value })} />
            <Input disabled={locked} value={rx.frequency} onChange={(e) => setRx({ ...rx, frequency: e.target.value })} />
            <Input disabled={locked} value={rx.duration} onChange={(e) => setRx({ ...rx, duration: e.target.value })} />
            <Button disabled={locked} onClick={async () => {
              await api("encounters/prescriptions", { method: "POST", body: JSON.stringify({ encounterId: id, items: [rx] }) });
              qc.invalidateQueries({ queryKey: ["encounter", id] });
            }}>Add prescription</Button>
          </div>
          <ul className="mt-2 text-sm">{q.data?.prescriptions.map((p) => <li key={p.id}>{p.prescriptionNo}</li>)}</ul>
        </Card>
      </div>
      {msg ? <p>{msg}</p> : null}
      {!locked ? (
        <Button onClick={async () => {
          await api("encounters/finalize", { method: "POST", body: JSON.stringify({ id }) });
          qc.invalidateQueries({ queryKey: ["encounter", id] });
        }}>Finalize (locks record)</Button>
      ) : <p className="text-sm text-slate-600">This encounter is finalized and cannot be edited.</p>}
    </div>
  );
}
