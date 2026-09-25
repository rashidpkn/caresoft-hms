"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, SecondaryButton, Select, Textarea } from "@/components/ui";
import { ErrorNote, Loading, SuccessNote } from "@/components/data-states";
import { useSession } from "@/lib/use-session";

type EncounterDetail = {
  encounter: {
    id: string;
    status: string;
    visitType: string;
    chiefComplaint: string | null;
    symptoms: string | null;
    examination: string | null;
    treatmentPlan: string | null;
    followUpNotes: string | null;
    followUpOn: string | null;
    startedAt: string;
    finalizedAt: string | null;
    patientId: string;
  };
  patient: { mrn: string; fullName: string; sex: string; dateOfBirth: string; allergies: string | null };
  doctor: { fullName: string; specialization: string };
  vitals: {
    id: string;
    temperatureC: string | null;
    pulseBpm: number | null;
    respiratoryRate: number | null;
    systolicMmHg: number | null;
    diastolicMmHg: number | null;
    spo2: number | null;
    weightKg: string | null;
    heightCm: string | null;
    recordedAt: string;
  }[];
  diagnoses: { id: string; description: string; type: string }[];
  prescriptions: { id: string; prescriptionNo: string; createdAt: string }[];
  prescriptionItems: {
    id: string;
    prescriptionId: string;
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: string;
    quantity: number;
    instructions: string | null;
  }[];
  labOrders: { id: string; orderNo: string; status: string }[];
};
type LabTest = { id: string; code: string; name: string; priceCents: number };
type Medicine = { id: string; name: string; sku: string };

type RxRow = { medicineName: string; dosage: string; frequency: string; duration: string; route: string; quantity: number; instructions: string };

const emptyRx: RxRow = { medicineName: "", dosage: "", frequency: "", duration: "", route: "oral", quantity: 1, instructions: "" };

export default function EncounterPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useSession();
  const [notice, setNotice] = useState("");

  const detail = useQuery({ queryKey: ["encounter", id], queryFn: () => api<EncounterDetail>(`encounters/${id}`) });
  const tests = useQuery({ queryKey: ["lab-tests"], queryFn: () => api<LabTest[]>("lab/tests"), enabled: can("lab.order.create") });
  const medicines = useQuery({ queryKey: ["medicines"], queryFn: () => api<Medicine[]>("pharmacy/medicines"), enabled: can("pharmacy.medicine.view") });

  const enc = detail.data?.encounter;
  const locked = enc?.status === "finalized";

  const [notes, setNotes] = useState({ symptoms: "", examination: "", treatmentPlan: "", followUpNotes: "", followUpOn: "" });
  const [diagnosisText, setDiagnosisText] = useState("");
  const [vitals, setVitals] = useState({ temperatureC: "", pulseBpm: "", respiratoryRate: "", systolicMmHg: "", diastolicMmHg: "", spo2: "", weightKg: "", heightCm: "" });
  const [rxRows, setRxRows] = useState<RxRow[]>([{ ...emptyRx }]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);

  useEffect(() => {
    if (!enc) return;
    setNotes({
      symptoms: enc.symptoms ?? "",
      examination: enc.examination ?? "",
      treatmentPlan: enc.treatmentPlan ?? "",
      followUpNotes: enc.followUpNotes ?? "",
      followUpOn: enc.followUpOn ?? "",
    });
    setDiagnosisText((detail.data?.diagnoses ?? []).map((d) => d.description).join("\n"));
  }, [enc?.id, enc?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNotes = useMutation({
    mutationFn: () =>
      api(`encounters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          symptoms: notes.symptoms,
          examination: notes.examination,
          treatmentPlan: notes.treatmentPlan,
          followUpNotes: notes.followUpNotes,
          followUpOn: notes.followUpOn || null,
          diagnoses: diagnosisText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((description, index) => ({ description, type: index === 0 ? "primary" : "secondary" })),
        }),
      }),
    onSuccess: () => {
      setNotice("Clinical notes saved.");
      qc.invalidateQueries({ queryKey: ["encounter", id] });
    },
  });

  const saveVitals = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | number> = { encounterId: id };
      for (const [key, value] of Object.entries(vitals)) {
        if (value !== "") payload[key] = value;
      }
      return api("encounters/vitals", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      setNotice("Vitals recorded.");
      setVitals({ temperatureC: "", pulseBpm: "", respiratoryRate: "", systolicMmHg: "", diastolicMmHg: "", spo2: "", weightKg: "", heightCm: "" });
      qc.invalidateQueries({ queryKey: ["encounter", id] });
    },
  });

  const savePrescription = useMutation({
    mutationFn: () =>
      api("encounters/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          encounterId: id,
          items: rxRows
            .filter((r) => r.medicineName.trim())
            .map((r) => ({ ...r, quantity: Number(r.quantity) || 1, instructions: r.instructions || undefined })),
        }),
      }),
    onSuccess: () => {
      setNotice("Prescription added.");
      setRxRows([{ ...emptyRx }]);
      qc.invalidateQueries({ queryKey: ["encounter", id] });
    },
  });

  const orderLabs = useMutation({
    mutationFn: () =>
      api("lab/orders", {
        method: "POST",
        body: JSON.stringify({ patientId: enc!.patientId, encounterId: id, testIds: selectedTests }),
      }),
    onSuccess: () => {
      setNotice("Lab order created and billed.");
      setSelectedTests([]);
      qc.invalidateQueries({ queryKey: ["encounter", id] });
    },
  });

  const finalize = useMutation({
    mutationFn: () => api("encounters/finalize", { method: "POST", body: JSON.stringify({ id }) }),
    onSuccess: () => {
      setNotice("Encounter finalized. The record is now read-only.");
      qc.invalidateQueries({ queryKey: ["encounter", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (detail.isLoading) return <Loading label="Loading encounter…" />;
  if (detail.isError) return <ErrorNote error={detail.error} />;
  const d = detail.data!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{d.patient.fullName}</h1>
          <p className="text-sm text-slate-600">
            {d.patient.mrn} · {d.patient.sex} · DOB {d.patient.dateOfBirth} · {d.doctor.fullName} ({d.doctor.specialization})
          </p>
          <p className="text-sm text-slate-600">
            Status <strong>{d.encounter.status}</strong>
            {d.encounter.finalizedAt ? ` · finalized ${new Date(d.encounter.finalizedAt).toLocaleString()}` : ""}
          </p>
        </div>
        <SecondaryButton onClick={() => window.print()}>Print prescription</SecondaryButton>
      </div>

      {d.patient.allergies ? (
        <Card className="border-red-300 bg-red-50 text-sm text-red-900">Allergies: {d.patient.allergies}</Card>
      ) : null}
      {locked ? (
        <Card className="border-slate-300 bg-slate-100 text-sm text-slate-700">
          This encounter is finalized. Clinical content cannot be edited; create a new encounter for changes.
        </Card>
      ) : null}

      <SuccessNote message={notice} />
      <ErrorNote error={saveNotes.error || saveVitals.error || savePrescription.error || orderLabs.error || finalize.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Clinical notes</h2>
          {d.encounter.chiefComplaint ? <p className="mt-1 text-sm text-slate-600">Chief complaint: {d.encounter.chiefComplaint}</p> : null}
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="symptoms">Symptoms</Label>
              <Textarea id="symptoms" rows={3} disabled={locked} value={notes.symptoms} onChange={(e) => setNotes({ ...notes, symptoms: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="examination">Examination</Label>
              <Textarea id="examination" rows={3} disabled={locked} value={notes.examination} onChange={(e) => setNotes({ ...notes, examination: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="diagnoses">Diagnoses (one per line, first is primary)</Label>
              <Textarea id="diagnoses" rows={3} disabled={locked} value={diagnosisText} onChange={(e) => setDiagnosisText(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="plan">Treatment plan</Label>
              <Textarea id="plan" rows={3} disabled={locked} value={notes.treatmentPlan} onChange={(e) => setNotes({ ...notes, treatmentPlan: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="followup-on">Follow-up date</Label>
                <Input id="followup-on" type="date" disabled={locked} value={notes.followUpOn} onChange={(e) => setNotes({ ...notes, followUpOn: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="followup-notes">Follow-up notes</Label>
                <Input id="followup-notes" disabled={locked} value={notes.followUpNotes} onChange={(e) => setNotes({ ...notes, followUpNotes: e.target.value })} />
              </div>
            </div>
            {!locked ? (
              <Button onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
                {saveNotes.isPending ? "Saving…" : "Save clinical notes"}
              </Button>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Vitals</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["temperatureC", "Temp °C"],
                ["pulseBpm", "Pulse"],
                ["respiratoryRate", "Resp"],
                ["spo2", "SpO₂ %"],
                ["systolicMmHg", "Systolic"],
                ["diastolicMmHg", "Diastolic"],
                ["weightKg", "Weight kg"],
                ["heightCm", "Height cm"],
              ].map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    inputMode="decimal"
                    disabled={locked || !can("vitals.record")}
                    value={vitals[key as keyof typeof vitals]}
                    onChange={(e) => setVitals({ ...vitals, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            {!locked && can("vitals.record") ? (
              <Button className="mt-3" onClick={() => saveVitals.mutate()} disabled={saveVitals.isPending}>
                Record vitals
              </Button>
            ) : null}
            {d.vitals.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {d.vitals.map((v) => (
                  <li key={v.id}>
                    {new Date(v.recordedAt).toLocaleString()} · BP {v.systolicMmHg ?? "-"}/{v.diastolicMmHg ?? "-"} · pulse {v.pulseBpm ?? "-"} · temp{" "}
                    {v.temperatureC ?? "-"} · SpO₂ {v.spo2 ?? "-"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No vitals recorded yet.</p>
            )}
          </Card>

          {can("lab.order.create") ? (
            <Card>
              <h2 className="font-semibold">Order laboratory tests</h2>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {(tests.data ?? []).map((t) => (
                  <label key={t.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selectedTests.includes(t.id)}
                      onChange={(e) =>
                        setSelectedTests((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                      }
                    />
                    {t.code} · {t.name}
                  </label>
                ))}
              </div>
              <Button className="mt-3" disabled={locked || selectedTests.length === 0 || orderLabs.isPending} onClick={() => orderLabs.mutate()}>
                Create lab order
              </Button>
              {d.labOrders.length > 0 ? (
                <ul className="mt-3 text-sm text-slate-700">
                  {d.labOrders.map((o) => (
                    <li key={o.id}>
                      {o.orderNo} · {o.status}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      {can("prescription.create") ? (
        <Card>
          <h2 className="font-semibold">Prescription</h2>
          <div className="mt-3 space-y-3">
            {rxRows.map((row, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-6">
                <div className="md:col-span-2">
                  <Label htmlFor={`med-${index}`}>Medicine</Label>
                  <Input
                    id={`med-${index}`}
                    list="medicine-options"
                    disabled={locked}
                    value={row.medicineName}
                    onChange={(e) => setRxRows((rows) => rows.map((r, i) => (i === index ? { ...r, medicineName: e.target.value } : r)))}
                  />
                </div>
                <div>
                  <Label htmlFor={`dose-${index}`}>Dosage</Label>
                  <Input id={`dose-${index}`} disabled={locked} value={row.dosage} onChange={(e) => setRxRows((rows) => rows.map((r, i) => (i === index ? { ...r, dosage: e.target.value } : r)))} />
                </div>
                <div>
                  <Label htmlFor={`freq-${index}`}>Frequency</Label>
                  <Input id={`freq-${index}`} disabled={locked} value={row.frequency} onChange={(e) => setRxRows((rows) => rows.map((r, i) => (i === index ? { ...r, frequency: e.target.value } : r)))} />
                </div>
                <div>
                  <Label htmlFor={`dur-${index}`}>Duration</Label>
                  <Input id={`dur-${index}`} disabled={locked} value={row.duration} onChange={(e) => setRxRows((rows) => rows.map((r, i) => (i === index ? { ...r, duration: e.target.value } : r)))} />
                </div>
                <div>
                  <Label htmlFor={`route-${index}`}>Route</Label>
                  <Select id={`route-${index}`} disabled={locked} value={row.route} onChange={(e) => setRxRows((rows) => rows.map((r, i) => (i === index ? { ...r, route: e.target.value } : r)))}>
                    {["oral", "topical", "iv", "im", "sc", "inhalation", "rectal", "ophthalmic"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
            <datalist id="medicine-options">
              {(medicines.data ?? []).map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
            {!locked ? (
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setRxRows((rows) => [...rows, { ...emptyRx }])}>Add medicine</SecondaryButton>
                <Button onClick={() => savePrescription.mutate()} disabled={savePrescription.isPending || !rxRows.some((r) => r.medicineName.trim())}>
                  Save prescription
                </Button>
              </div>
            ) : null}
          </div>

          {d.prescriptions.length > 0 ? (
            <div className="mt-4 border-t pt-3">
              {d.prescriptions.map((rx) => (
                <div key={rx.id} className="mb-3">
                  <div className="text-sm font-semibold">{rx.prescriptionNo}</div>
                  <ul className="text-sm text-slate-700">
                    {d.prescriptionItems
                      .filter((i) => i.prescriptionId === rx.id)
                      .map((i) => (
                        <li key={i.id}>
                          {i.medicineName} — {i.dosage}, {i.frequency}, {i.duration} ({i.route})
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {!locked && can("consultation.finalize") ? (
        <Button
          onClick={() => {
            if (window.confirm("Finalize this encounter? Clinical content becomes read-only.")) finalize.mutate();
          }}
          disabled={finalize.isPending}
        >
          Finalize encounter
        </Button>
      ) : null}
    </div>
  );
}
