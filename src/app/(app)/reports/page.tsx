"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

export default function ReportsPage() {
  const patients = useQuery({ queryKey: ["rep-patients"], queryFn: () => api<{ count: number }>("reports/patients") });
  const appts = useQuery({ queryKey: ["rep-appts"], queryFn: () => api<{ status: string; count: number }[]>("reports/appointments") });
  const pharmacy = useQuery({ queryKey: ["rep-pharm"], queryFn: () => api<{ low: unknown[]; expiring: unknown[] }>("reports/pharmacy") });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-slate-600">Each report endpoint enforces its own permission. Unavailable cards mean your role cannot access that dataset.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-slate-500">Patients registered (30d)</div>
          <div className="text-2xl">{patients.data?.count ?? (patients.isError ? "no access" : "…")}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Appointments by status</div>
          <ul className="text-sm">{(appts.data ?? []).map((a) => <li key={a.status}>{a.status}: {a.count}</li>)}</ul>
          {appts.isError ? <p>no access</p> : null}
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Pharmacy alerts</div>
          {pharmacy.isError ? <p>no access</p> : <p>Low stock {pharmacy.data?.low.length ?? 0} · Expiring {pharmacy.data?.expiring.length ?? 0}</p>}
        </Card>
      </div>
    </div>
  );
}
