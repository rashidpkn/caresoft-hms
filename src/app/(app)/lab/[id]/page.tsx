"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

type Detail = {
  order: { id: string; orderNo: string; status: string };
  items: { id: string; status: string; test: { name: string } | null; result: { id: string; value: string | null; status: string } | null }[];
  samples: { id: string; sampleNo: string; status: string }[];
};

export default function LabOrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lab-order", id], queryFn: () => api<Detail>(`lab/orders/${id}`) });
  const [values, setValues] = useState<Record<string, string>>({});
  const d = q.data;
  if (!d) return <p>Loading order…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Lab order {d.order.orderNo}</h1>
      <p>Status {d.order.status}</p>
      <Button onClick={async () => {
        await api("lab/samples", { method: "POST", body: JSON.stringify({ orderId: d.order.id, specimenType: "blood" }) });
        qc.invalidateQueries({ queryKey: ["lab-order", id] });
      }}>Collect sample</Button>
      {d.samples.map((s) => (
        <Card key={s.id}>
          Sample {s.sampleNo} · {s.status}
          {s.status === "collected" ? (
            <Button className="ml-2" onClick={async () => {
              await api("lab/samples/receive", { method: "POST", body: JSON.stringify({ sampleId: s.id }) });
              qc.invalidateQueries({ queryKey: ["lab-order", id] });
            }}>Mark received</Button>
          ) : null}
        </Card>
      ))}
      {d.items.map((item) => (
        <Card key={item.id}>
          <div className="font-medium">{item.test?.name} · {item.status}</div>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Result value"
              value={values[item.id] ?? item.result?.value ?? ""}
              onChange={(e) => setValues({ ...values, [item.id]: e.target.value })}
            />
            <Button onClick={async () => {
              await api("lab/results", { method: "POST", body: JSON.stringify({ orderItemId: item.id, value: values[item.id] ?? "" }) });
              qc.invalidateQueries({ queryKey: ["lab-order", id] });
            }}>Enter</Button>
            {item.result ? (
              <Button className="bg-slate-700" onClick={async () => {
                await api("lab/results/verify", { method: "POST", body: JSON.stringify({ resultId: item.result!.id }) });
                qc.invalidateQueries({ queryKey: ["lab-order", id] });
              }}>Verify</Button>
            ) : null}
          </div>
        </Card>
      ))}
      <Button className="bg-slate-700" onClick={() => window.print()}>Print report</Button>
    </div>
  );
}
