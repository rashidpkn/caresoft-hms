"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, SecondaryButton, Select } from "@/components/ui";
import { ErrorNote, Loading, SuccessNote } from "@/components/data-states";
import { useSession } from "@/lib/use-session";

type OrderDetail = {
  order: { id: string; orderNo: string; status: string; priority: string; clinicalNotes: string | null; createdAt: string };
  patient: { mrn: string; fullName: string; sex: string; dateOfBirth: string };
  items: {
    id: string;
    status: string;
    test: { name: string; code: string; unit: string | null; referenceRange: string | null } | null;
    result: { id: string; value: string | null; unit: string | null; flag: string | null; status: string; enteredBy: string | null; verifiedAt: string | null } | null;
  }[];
  samples: { id: string; sampleNo: string; specimenType: string; status: string; collectedAt: string }[];
};

export default function LabOrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can, user } = useSession();
  const [values, setValues] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const detail = useQuery({ queryKey: ["lab-order", id], queryFn: () => api<OrderDetail>(`lab/orders/${id}`) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lab-order", id] });
    qc.invalidateQueries({ queryKey: ["lab-worklist"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const collect = useMutation({
    mutationFn: (specimenType: string) => api("lab/samples", { method: "POST", body: JSON.stringify({ orderId: id, specimenType }) }),
    onSuccess: () => {
      setNotice("Sample collected.");
      invalidate();
    },
  });
  const receive = useMutation({
    mutationFn: (sampleId: string) => api("lab/samples/receive", { method: "POST", body: JSON.stringify({ sampleId }) }),
    onSuccess: () => {
      setNotice("Sample received in the lab.");
      invalidate();
    },
  });
  const enter = useMutation({
    mutationFn: (orderItemId: string) =>
      api("lab/results", {
        method: "POST",
        body: JSON.stringify({ orderItemId, value: values[orderItemId] ?? "", flag: flags[orderItemId] || undefined }),
      }),
    onSuccess: () => {
      setNotice("Result saved and sent for verification.");
      invalidate();
    },
  });
  const verify = useMutation({
    mutationFn: (resultId: string) => api("lab/results/verify", { method: "POST", body: JSON.stringify({ resultId }) }),
    onSuccess: () => {
      setNotice("Result verified and released.");
      invalidate();
    },
  });

  if (detail.isLoading) return <Loading label="Loading lab order…" />;
  if (detail.isError) return <ErrorNote error={detail.error} />;
  const d = detail.data!;
  const allVerified = d.items.length > 0 && d.items.every((i) => i.result?.status === "verified");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lab order {d.order.orderNo}</h1>
          <p className="text-sm text-slate-600">
            {d.patient.fullName} · {d.patient.mrn} · {d.patient.sex} · DOB {d.patient.dateOfBirth}
          </p>
          <p className="text-sm text-slate-600">
            Status <strong>{d.order.status.replace("_", " ")}</strong> · priority {d.order.priority}
          </p>
        </div>
        {can("lab.report.print") ? (
          <SecondaryButton disabled={!allVerified} onClick={() => window.print()}>
            {allVerified ? "Print report" : "Print after verification"}
          </SecondaryButton>
        ) : null}
      </div>

      <SuccessNote message={notice} />
      <ErrorNote error={collect.error || receive.error || enter.error || verify.error} />

      <Card>
        <h2 className="font-semibold">Samples</h2>
        {d.samples.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No sample collected yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {d.samples.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>
                  {s.sampleNo} · {s.specimenType} · {s.status} · collected {new Date(s.collectedAt).toLocaleString()}
                </span>
                {s.status === "collected" && can("lab.result.enter") ? (
                  <Button className="px-2 py-1 text-xs" onClick={() => receive.mutate(s.id)}>
                    Mark received
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {can("lab.sample.collect") && d.order.status === "ordered" ? (
          <div className="mt-3 flex items-end gap-2">
            <Button onClick={() => collect.mutate("blood")}>Collect blood sample</Button>
            <Button className="bg-slate-700" onClick={() => collect.mutate("urine")}>
              Collect urine sample
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-semibold">Tests and results</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2">Test</th>
              <th>Reference</th>
              <th>Result</th>
              <th>Flag</th>
              <th>State</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((item) => {
              const verified = item.result?.status === "verified";
              const enteredByMe = item.result?.enteredBy === user?.id;
              return (
                <tr key={item.id} className="border-b align-top">
                  <td className="py-2">
                    {item.test?.name}
                    <div className="text-xs text-slate-500">{item.test?.code}</div>
                  </td>
                  <td className="text-slate-600">
                    {item.test?.referenceRange ?? "—"}
                    {item.test?.unit ? ` ${item.test.unit}` : ""}
                  </td>
                  <td>
                    {verified ? (
                      <span className="font-medium">{item.result?.value}</span>
                    ) : can("lab.result.enter") ? (
                      <Input
                        aria-label={`Result for ${item.test?.name ?? "test"}`}
                        className="w-28"
                        value={values[item.id] ?? item.result?.value ?? ""}
                        onChange={(e) => setValues({ ...values, [item.id]: e.target.value })}
                      />
                    ) : (
                      (item.result?.value ?? "—")
                    )}
                  </td>
                  <td>
                    {verified ? (
                      (item.result?.flag ?? "—")
                    ) : can("lab.result.enter") ? (
                      <Select
                        aria-label={`Flag for ${item.test?.name ?? "test"}`}
                        className="w-28"
                        value={flags[item.id] ?? item.result?.flag ?? ""}
                        onChange={(e) => setFlags({ ...flags, [item.id]: e.target.value })}
                      >
                        <option value="">normal</option>
                        <option value="low">low</option>
                        <option value="high">high</option>
                        <option value="critical">critical</option>
                      </Select>
                    ) : (
                      (item.result?.flag ?? "—")
                    )}
                  </td>
                  <td>{item.result?.status ?? "pending"}</td>
                  <td className="space-x-2 py-2 text-right">
                    {!verified && can("lab.result.enter") ? (
                      <Button
                        className="px-2 py-1 text-xs"
                        disabled={enter.isPending || !(values[item.id] ?? item.result?.value)}
                        onClick={() => enter.mutate(item.id)}
                      >
                        Save result
                      </Button>
                    ) : null}
                    {item.result && item.result.status === "entered" && can("lab.result.verify") ? (
                      <Button
                        className="px-2 py-1 text-xs bg-slate-700"
                        disabled={verify.isPending || enteredByMe}
                        title={enteredByMe ? "You entered this result, so someone else must verify it" : undefined}
                        onClick={() => verify.mutate(item.result!.id)}
                      >
                        Verify
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.items.some((i) => i.result?.enteredBy === user?.id && i.result?.status === "entered") ? (
          <p className="mt-3 text-sm text-slate-600">
            Results you entered must be verified by another authorised user. The verify button stays disabled for you.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
