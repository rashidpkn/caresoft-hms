"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

type Detail = {
  invoice: { id: string; invoiceNo: string; status: string; totalCents: number; paidCents: number; refundedCents: number };
  items: { id: string; description: string; quantity: number; lineTotalCents: number }[];
  payments: { id: string; paymentNo: string; amountCents: number; method: string }[];
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api<Detail>(`billing/invoices/${id}`) });
  const d = q.data;
  if (!d) return <p>Loading invoice…</p>;
  const due = d.invoice.totalCents - (d.invoice.paidCents - d.invoice.refundedCents);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Invoice {d.invoice.invoiceNo}</h1>
      <p>Status {d.invoice.status} · Total {formatMoney(d.invoice.totalCents)} · Due {formatMoney(due)}</p>
      <Card>
        <ul className="text-sm">
          {d.items.map((i) => <li key={i.id}>{i.description} × {i.quantity} = {formatMoney(i.lineTotalCents)}</li>)}
        </ul>
      </Card>
      <div className="flex gap-2">
        <Button disabled={due <= 0} onClick={async () => {
          await api("billing/payments", { method: "POST", body: JSON.stringify({ invoiceId: d.invoice.id, method: "cash", amountCents: due }) });
          qc.invalidateQueries({ queryKey: ["invoice", id] });
        }}>Take payment (cash, due)</Button>
        <Button className="bg-slate-700" onClick={() => window.print()}>Print receipt</Button>
      </div>
    </div>
  );
}
