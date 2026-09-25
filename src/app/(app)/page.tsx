"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{
      roleCode: string;
      patientCount: number;
      todayAppointments: number;
      openInvoices: number;
      pendingLab: number;
      todayRevenueCents: number;
    }>("dashboard"),
  });
  const d = q.data;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-slate-600">Role-aware operational snapshot. Sensitive totals only appear if your account is permitted.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><div className="text-sm text-slate-500">Patients</div><div className="text-2xl font-semibold">{d?.patientCount ?? "—"}</div></Card>
        <Card><div className="text-sm text-slate-500">Today&apos;s appointments</div><div className="text-2xl font-semibold">{d?.todayAppointments ?? "—"}</div></Card>
        <Card><div className="text-sm text-slate-500">Open invoices</div><div className="text-2xl font-semibold">{d?.openInvoices ?? "—"}</div></Card>
        <Card><div className="text-sm text-slate-500">Pending lab</div><div className="text-2xl font-semibold">{d?.pendingLab ?? "—"}</div></Card>
      </div>
      {d && (d.roleCode === "admin" || d.roleCode === "super_admin" || d.roleCode === "accountant") ? (
        <Card className="mt-4">
          <div className="text-sm text-slate-500">Today&apos;s collections</div>
          <div className="text-2xl font-semibold">{formatMoney(d.todayRevenueCents)}</div>
        </Card>
      ) : null}
    </div>
  );
}
