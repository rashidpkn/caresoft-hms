"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Label, Select } from "@/components/ui";
import Link from "next/link";

type Order = { id: string; orderNo: string; status: string; patientId: string };
type Test = { id: string; code: string; name: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

export default function LabPage() {
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ["lab-orders"], queryFn: () => api<Order[]>("lab/orders") });
  const tests = useQuery({ queryKey: ["lab-tests"], queryFn: () => api<Test[]>("lab/tests") });
  const patients = useQuery({ queryKey: ["patients", ""], queryFn: () => api<{ items: Patient[] }>("patients?q=") });
  const [patientId, setPatientId] = useState("");
  const [testId, setTestId] = useState("");
  const [msg, setMsg] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api("lab/orders", { method: "POST", body: JSON.stringify({ patientId, testIds: [testId] }) });
      setMsg("Order created");
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Laboratory</h1>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Order</th><th>Status</th></tr></thead>
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr key={o.id} className="border-b">
                <td className="py-2"><Link className="text-teal-800" href={`/lab/${o.id}`}>{o.orderNo}</Link></td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">New lab order</h2>
        <form onSubmit={create} className="mt-3 space-y-3">
          <div>
            <Label>Patient</Label>
            <Select value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
              <option value="">Select</option>
              {(patients.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.mrn} {p.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Test</Label>
            <Select value={testId} onChange={(e) => setTestId(e.target.value)} required>
              <option value="">Select</option>
              {(tests.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
            </Select>
          </div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Create order</Button>
        </form>
      </Card>
    </div>
  );
}
