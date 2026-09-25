"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, SecondaryButton, Select } from "@/components/ui";
import { Empty, ErrorNote, Loading } from "@/components/data-states";
import { useSession } from "@/lib/use-session";
import { todayISODate } from "@/lib/utils";

type Dashboard = {
  doctor?: {
    doctorId: string | null;
    queue: { queueId: string; tokenNumber: number; status: string; patientName: string; patientMrn: string; appointmentId: string; patientId: string }[];
    draftEncounters: { id: string; patientName: string; startedAt: string }[];
  };
};
type Doctor = { id: string; fullName: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

export default function ClinicPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { can, user } = useSession();
  const [patientQuery, setPatientQuery] = useState("");
  const [walkIn, setWalkIn] = useState({ patientId: "", doctorId: "", chiefComplaint: "" });

  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("dashboard") });
  const myDoctor = useQuery({ queryKey: ["my-doctor"], queryFn: () => api<Doctor | null>("doctors/me") });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("doctors") });
  const patients = useQuery({
    queryKey: ["patients", patientQuery],
    queryFn: () => api<{ items: Patient[] }>(`patients?q=${encodeURIComponent(patientQuery)}`),
  });

  const startConsult = useMutation({
    mutationFn: (args: { patientId: string; doctorId: string; appointmentId?: string; chiefComplaint?: string }) =>
      api<{ id: string }>("encounters", { method: "POST", body: JSON.stringify(args) }),
    onSuccess: (encounter) => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/consultations/${encounter.id}`);
    },
  });

  const callPatient = useMutation({
    mutationFn: (queueId: string) => api(`queue/${queueId}/status`, { method: "POST", body: JSON.stringify({ status: "called" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const doctorId = myDoctor.data?.id ?? "";
  const queue = dash.data?.doctor?.queue ?? [];
  const drafts = dash.data?.doctor?.draftEncounters ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My clinic</h1>
        <p className="text-sm text-slate-600">
          {myDoctor.data ? `${myDoctor.data.fullName} · ${todayISODate()}` : "Consultation workspace"}
        </p>
      </div>

      <ErrorNote error={startConsult.error || callPatient.error} />

      <Card>
        <h2 className="font-semibold">Waiting queue</h2>
        {dash.isLoading ? (
          <Loading />
        ) : queue.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No checked-in patients. Reception check-in puts patients here in token order.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2">Token</th>
                <th>Patient</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.queueId} className="border-b">
                  <td className="py-2 font-semibold">#{item.tokenNumber}</td>
                  <td>
                    <Link className="text-teal-800 hover:underline" href={`/patients/${item.patientId}`}>
                      {item.patientName}
                    </Link>
                    <div className="text-xs text-slate-500">{item.patientMrn}</div>
                  </td>
                  <td>{item.status}</td>
                  <td className="space-x-2 py-2 text-right">
                    <SecondaryButton className="px-2 py-1 text-xs" onClick={() => callPatient.mutate(item.queueId)}>
                      Call
                    </SecondaryButton>
                    {can("consultation.create") ? (
                      <Button
                        className="px-2 py-1 text-xs"
                        disabled={startConsult.isPending || !doctorId}
                        onClick={() =>
                          startConsult.mutate({
                            patientId: item.patientId,
                            doctorId,
                            appointmentId: item.appointmentId,
                          })
                        }
                      >
                        Start consultation
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">My unfinalized encounters</h2>
        {drafts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing in progress.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span>
                  {d.patientName} <span className="text-slate-500">started {new Date(d.startedAt).toLocaleString()}</span>
                </span>
                <Link className="text-teal-800 hover:underline" href={`/consultations/${d.id}`}>
                  Continue
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can("consultation.create") ? (
        <Card>
          <h2 className="font-semibold">Unscheduled / walk-in consultation</h2>
          <p className="mt-1 text-sm text-slate-600">Use this when there is no booked appointment.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="q">Find patient</Label>
              <Input id="q" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="MRN or name" />
            </div>
            <div>
              <Label htmlFor="wi-patient">Patient</Label>
              <Select id="wi-patient" value={walkIn.patientId} onChange={(e) => setWalkIn({ ...walkIn, patientId: e.target.value })}>
                <option value="">Select</option>
                {(patients.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mrn} · {p.firstName} {p.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="wi-doctor">Doctor</Label>
              <Select
                id="wi-doctor"
                value={walkIn.doctorId || doctorId}
                onChange={(e) => setWalkIn({ ...walkIn, doctorId: e.target.value })}
              >
                <option value="">Select</option>
                {(doctors.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="wi-complaint">Chief complaint</Label>
              <Input id="wi-complaint" value={walkIn.chiefComplaint} onChange={(e) => setWalkIn({ ...walkIn, chiefComplaint: e.target.value })} />
            </div>
          </div>
          <Button
            className="mt-3"
            disabled={!walkIn.patientId || !(walkIn.doctorId || doctorId) || startConsult.isPending}
            onClick={() =>
              startConsult.mutate({
                patientId: walkIn.patientId,
                doctorId: walkIn.doctorId || doctorId,
                chiefComplaint: walkIn.chiefComplaint || undefined,
              })
            }
          >
            Open encounter
          </Button>
        </Card>
      ) : (
        <Empty title="Your role cannot start consultations" hint={`Signed in as ${user?.roleName ?? "staff"}.`} />
      )}
    </div>
  );
}
