"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import Link from "next/link";

type Invoice = { id: string; invoiceNo: string; status: string; totalCents: number; paidCents: number; source: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };
type Service = { id: string; code: string; name: string; priceCents: number; category: string };

export default function BillingPage() {
  const qc = useQueryClient();
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api<Invoice[]>("billing/invoices") });
  const patients = useQuery({ queryKey: ["patients", ""], queryFn: () => api<{ items: Patient[] }>("patients?q=") });
  const services = useQuery({ queryKey: ["services"], queryFn: () => api<Service[]>("billing/services") });
  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [msg, setMsg] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    const svc = services.data?.find((s) => s.id === serviceId);
    if (!svc) return;
    try {
      const inv = await api<Invoice>("billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientId: patientId || null,
          source: svc.category === "consultation" ? "consultation" : "service",
          items: [{ itemType: svc.category === "consultation" ? "consultation" : "service", referenceId: svc.id, description: svc.name, quantity: 1, unitPriceCents: svc.priceCents }],
        }),
      });
      setMsg(`Created ${inv.invoiceNo}`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Invoice</th><th>Source</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>
            {(invoices.data ?? []).map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2"><Link className="text-teal-800" href={`/billing/${i.id}`}>{i.invoiceNo}</Link></td>
                <td>{i.source}</td>
                <td>{formatMoney(i.totalCents)}</td>
                <td>{formatMoney(i.paidCents)}</td>
                <td>{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">New invoice</h2>
        <form onSubmit={create} className="mt-3 space-y-3">
          <div>
            <Label>Patient</Label>
            <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Optional</option>
              {(patients.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.mrn} {p.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Service</Label>
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              <option value="">Select</option>
              {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} ({formatMoney(s.priceCents)})</option>)}
            </Select>
          </div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Create invoice</Button>
        </form>
      </Card>
    </div>
  );
}
