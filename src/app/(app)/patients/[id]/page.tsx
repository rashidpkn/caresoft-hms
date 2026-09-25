"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import Link from "next/link";

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api<{
      patient: { mrn: string; firstName: string; lastName: string; sex: string; dateOfBirth: string; allergies: string | null; emergencyName: string | null };
      encounters: { id: string; startedAt: string; status: string }[];
      appointments: { id: string; scheduledAt: string; status: string }[];
      prescriptions: { id: string; prescriptionNo: string; createdAt: string }[];
    }>(`patients/${id}/timeline`),
  });
  const d = q.data;
  if (!d) return <p>Loading patient…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{d.patient.firstName} {d.patient.lastName}</h1>
      <p className="text-slate-600">MRN {d.patient.mrn} · {d.patient.sex} · DOB {d.patient.dateOfBirth}</p>
      {d.patient.allergies ? <Card className="border-red-300 bg-red-50">Allergies: {d.patient.allergies}</Card> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Encounters</h2>
          <ul className="mt-2 text-sm">
            {d.encounters.map((e) => <li key={e.id}><Link className="text-teal-800" href={`/consultations/${e.id}`}>{new Date(e.startedAt).toLocaleString()} ({e.status})</Link></li>)}
            {d.encounters.length === 0 ? <li className="text-slate-500">None</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Appointments</h2>
          <ul className="mt-2 text-sm">
            {d.appointments.map((e) => <li key={e.id}>{new Date(e.scheduledAt).toLocaleString()} · {e.status}</li>)}
            {d.appointments.length === 0 ? <li className="text-slate-500">None</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Prescriptions</h2>
          <ul className="mt-2 text-sm">
            {d.prescriptions.map((e) => <li key={e.id}>{e.prescriptionNo}</li>)}
            {d.prescriptions.length === 0 ? <li className="text-slate-500">None</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
