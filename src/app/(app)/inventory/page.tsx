"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { todayISODate } from "@/lib/utils";

type Medicine = { id: string; name: string; sku: string };
type Supplier = { id: string; name: string };
type Batch = { id: string; medicineName: string; batchNumber: string; quantityOnHand: number; expiryDate: string };

export default function InventoryPage() {
  const qc = useQueryClient();
  const meds = useQuery({ queryKey: ["medicines"], queryFn: () => api<Medicine[]>("pharmacy/medicines") });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("pharmacy/suppliers") });
  const batches = useQuery({ queryKey: ["batches", "all"], queryFn: () => api<Batch[]>("pharmacy/batches") });
  const [form, setForm] = useState({
    supplierId: "", medicineId: "", batchNumber: "B1", expiryDate: "2028-01-01", quantity: 100,
    purchaseRateCents: 200, mrpCents: 400, unitPriceCents: 350, gstBps: 1200,
  });
  const [msg, setMsg] = useState("");

  async function receive(e: FormEvent) {
    e.preventDefault();
    try {
      await api("pharmacy/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: form.supplierId,
          purchasedAt: todayISODate(),
          items: [{
            medicineId: form.medicineId,
            batchNumber: form.batchNumber,
            expiryDate: form.expiryDate,
            quantity: Number(form.quantity),
            purchaseRateCents: Number(form.purchaseRateCents),
            mrpCents: Number(form.mrpCents),
            unitPriceCents: Number(form.unitPriceCents),
            gstBps: Number(form.gstBps),
          }],
        }),
      });
      setMsg("Stock received");
      qc.invalidateQueries({ queryKey: ["batches"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Medicine</th><th>Batch</th><th>Qty</th><th>Expiry</th></tr></thead>
          <tbody>
            {(batches.data ?? []).map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-2">{b.medicineName}</td>
                <td>{b.batchNumber}</td>
                <td>{b.quantityOnHand}</td>
                <td>{b.expiryDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">Receive purchase</h2>
        <form onSubmit={receive} className="mt-3 space-y-3">
          <div>
            <Label>Supplier</Label>
            <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">Select</option>
              {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Medicine</Label>
            <Select value={form.medicineId} onChange={(e) => setForm({ ...form, medicineId: e.target.value })} required>
              <option value="">Select</option>
              {(meds.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.sku} {m.name}</option>)}
            </Select>
          </div>
          <div><Label>Batch</Label><Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} /></div>
          <div><Label>Expiry</Label><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
          <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
          <div><Label>Purchase rate (cents)</Label><Input type="number" value={form.purchaseRateCents} onChange={(e) => setForm({ ...form, purchaseRateCents: Number(e.target.value) })} /></div>
          <div><Label>Unit price (cents)</Label><Input type="number" value={form.unitPriceCents} onChange={(e) => setForm({ ...form, unitPriceCents: Number(e.target.value) })} /></div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Receive stock</Button>
        </form>
      </Card>
    </div>
  );
}
