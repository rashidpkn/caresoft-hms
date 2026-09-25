"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { Empty, ErrorNote, Loading, SuccessNote } from "@/components/data-states";
import { useSession } from "@/lib/use-session";

type WorklistRow = {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  priority: string;
  createdAt: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  itemCount: number;
  entered: number;
  verified: number;
  canVerifyAny: boolean;
};
type LabTest = { id: string; code: string; name: string; priceCents: number };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

const STAGES = [
  { key: "ordered", label: "To collect" },
  { key: "in_process", label: "In processing" },
  { key: "to_verify", label: "Awaiting verification" },
  { key: "completed", label: "Completed" },
] as const;

export default function LabPage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [stage, setStage] = useState<(typeof STAGES)[number]["key"]>("ordered");
  const [notice, setNotice] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [order, setOrder] = useState({ patientId: "", testIds: [] as string[], priority: "routine" });

  const worklist = useQuery({ queryKey: ["lab-worklist"], queryFn: () => api<WorklistRow[]>("lab/worklist"), refetchInterval: 30_000 });
  const tests = useQuery({ queryKey: ["lab-tests"], queryFn: () => api<LabTest[]>("lab/tests") });
  const patients = useQuery({
    queryKey: ["patients", patientQuery],
    queryFn: () => api<{ items: Patient[] }>(`patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: can("lab.order.create") && can("patient.view"),
  });

  const createOrder = useMutation({
    mutationFn: () => api("lab/orders", { method: "POST", body: JSON.stringify(order) }),
    onSuccess: () => {
      setNotice("Lab order created and billed.");
      setOrder({ patientId: "", testIds: [], priority: "routine" });
      qc.invalidateQueries({ queryKey: ["lab-worklist"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const collect = useMutation({
    mutationFn: (orderId: string) => api("lab/samples", { method: "POST", body: JSON.stringify({ orderId, specimenType: "blood" }) }),
    onSuccess: () => {
      setNotice("Sample collected and labelled.");
      qc.invalidateQueries({ queryKey: ["lab-worklist"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const rows = worklist.data ?? [];
  const filtered = rows.filter((r) => {
    if (stage === "ordered") return r.orderStatus === "ordered";
    if (stage === "in_process") return ["sample_collected", "processing"].includes(r.orderStatus) && r.verified < r.itemCount && r.entered < r.itemCount;
    if (stage === "to_verify") return r.entered > 0;
    return r.orderStatus === "completed";
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Laboratory worklist</h1>
        <p className="text-sm text-slate-600">
          Collection, result entry and verification are separate permissions. Whoever enters a result cannot verify it.
        </p>
      </div>

      <SuccessNote message={notice} />
      <ErrorNote error={collect.error || createOrder.error} />

      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStage(s.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              stage === s.key ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white hover:bg-slate-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {worklist.isLoading ? (
        <Loading label="Loading worklist…" />
      ) : filtered.length === 0 ? (
        <Empty title="Nothing in this stage" hint="Orders move through collect → process → verify." />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2">Order</th>
              <th>Patient</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Progress</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.orderId} className="border-b">
                <td className="py-2">
                  <Link className="text-teal-800 hover:underline" href={`/lab/${r.orderId}`}>
                    {r.orderNo}
                  </Link>
                  <div className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</div>
                </td>
                <td>
                  {r.patientName}
                  <div className="text-xs text-slate-500">{r.patientMrn}</div>
                </td>
                <td>{r.priority}</td>
                <td>{r.orderStatus.replace("_", " ")}</td>
                <td>
                  {r.verified}/{r.itemCount} verified
                  {r.entered > 0 ? ` · ${r.entered} awaiting` : ""}
                </td>
                <td className="space-x-2 py-2 text-right">
                  {r.orderStatus === "ordered" && can("lab.sample.collect") ? (
                    <Button className="px-2 py-1 text-xs" disabled={collect.isPending} onClick={() => collect.mutate(r.orderId)}>
                      Collect sample
                    </Button>
                  ) : null}
                  <Link className="text-xs font-medium text-teal-800 hover:underline" href={`/lab/${r.orderId}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {can("lab.order.create") ? (
        <Card>
          <h2 className="font-semibold">New lab order</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="lab-pat-q">Find patient</Label>
              <Input id="lab-pat-q" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="MRN or name" />
            </div>
            <div>
              <Label htmlFor="lab-patient">Patient</Label>
              <Select id="lab-patient" value={order.patientId} onChange={(e) => setOrder({ ...order, patientId: e.target.value })}>
                <option value="">Select</option>
                {(patients.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.mrn} · {p.firstName} {p.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="lab-priority">Priority</Label>
              <Select id="lab-priority" value={order.priority} onChange={(e) => setOrder({ ...order, priority: e.target.value })}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </Select>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {(tests.data ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={order.testIds.includes(t.id)}
                  onChange={(e) =>
                    setOrder((prev) => ({
                      ...prev,
                      testIds: e.target.checked ? [...prev.testIds, t.id] : prev.testIds.filter((x) => x !== t.id),
                    }))
                  }
                />
                {t.code} · {t.name}
              </label>
            ))}
          </div>
          <Button className="mt-3" disabled={!order.patientId || order.testIds.length === 0 || createOrder.isPending} onClick={() => createOrder.mutate()}>
            Create order
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
