"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

type Batch = { id: string; batchNumber: string; medicineName: string; quantityOnHand: number; unitPriceCents: number; expiryDate: string };
type Patient = { id: string; mrn: string; firstName: string; lastName: string };

export default function PharmacyPage() {
  const qc = useQueryClient();
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api<Batch[]>("pharmacy/batches") });
  const patients = useQuery({ queryKey: ["patients", ""], queryFn: () => api<{ items: Patient[] }>("patients?q=") });
  const [cart, setCart] = useState<{ batchId: string; quantity: number }[]>([]);
  const [patientId, setPatientId] = useState("");
  const [msg, setMsg] = useState("");

  function add(batchId: string) {
    setCart((c) => {
      const found = c.find((x) => x.batchId === batchId);
      if (found) return c.map((x) => x.batchId === batchId ? { ...x, quantity: x.quantity + 1 } : x);
      return [...c, { batchId, quantity: 1 }];
    });
  }

  async function sell(e: FormEvent) {
    e.preventDefault();
    try {
      const inv = await api<{ invoiceNo: string; totalCents: number }>("pharmacy/sales", {
        method: "POST",
        body: JSON.stringify({ patientId: patientId || null, items: cart, paymentMethod: "cash", amountTenderedCents: undefined }),
      });
      setMsg(`Sale ${inv.invoiceNo} total ${formatMoney(inv.totalCents)}`);
      setCart([]);
      qc.invalidateQueries({ queryKey: ["batches"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Pharmacy dispensing</h1>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Medicine</th><th>Batch</th><th>Qty</th><th>Price</th><th>Expiry</th><th></th></tr></thead>
          <tbody>
            {(batches.data ?? []).map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-2">{b.medicineName}</td>
                <td>{b.batchNumber}</td>
                <td>{b.quantityOnHand}</td>
                <td>{formatMoney(b.unitPriceCents)}</td>
                <td>{b.expiryDate}</td>
                <td><Button className="px-2 py-1 text-xs" onClick={() => add(b.id)}>Add</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">Cart</h2>
        <form onSubmit={sell} className="mt-3 space-y-3">
          <div>
            <Label>Patient (optional)</Label>
            <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Walk-in</option>
              {(patients.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.mrn} {p.firstName}</option>)}
            </Select>
          </div>
          <ul className="text-sm">
            {cart.map((c) => {
              const b = batches.data?.find((x) => x.id === c.batchId);
              return <li key={c.batchId}>{b?.medicineName} × {c.quantity}</li>;
            })}
          </ul>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit" disabled={!cart.length}>Complete sale</Button>
        </form>
      </Card>
    </div>
  );
}
