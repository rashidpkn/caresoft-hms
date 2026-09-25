"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { Empty, ErrorNote, Loading } from "@/components/data-states";

type Metric = { key: string; label: string; value: string; tone: "default" | "warn" | "danger"; hint?: string };

type Dashboard = {
  roleCode: string;
  roleName: string;
  headline: string;
  cards: Metric[];
  doctor?: {
    doctorId: string | null;
    queue: { queueId: string; tokenNumber: number; status: string; patientName: string; patientMrn: string; appointmentId: string; patientId: string }[];
    draftEncounters: { id: string; patientName: string; startedAt: string }[];
  };
  pharmacy?: {
    lowStock: { medicine: string; batchNumber: string; quantityOnHand: number; reorderLevel: number }[];
    expiring: { medicine: string; batchNumber: string; quantityOnHand: number; expiryDate: string }[];
  };
  lab?: { toCollect: number; processing: number; awaitingVerification: number; completedToday: number };
  reception?: { today: { id: string; scheduledAt: string; status: string; patientName: string; doctorName: string }[]; unpaidInvoices: number };
};

const toneClass: Record<Metric["tone"], string> = {
  default: "border-slate-200",
  warn: "border-amber-300 bg-amber-50",
  danger: "border-red-300 bg-red-50",
};

export default function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("dashboard"), refetchInterval: 30_000 });
  if (q.isLoading) return <Loading label="Loading your dashboard…" />;
  if (q.isError) return <ErrorNote error={q.error} />;
  const d = q.data!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          {d.roleName} · {d.headline}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d.cards.map((card) => (
          <div key={card.key} className={`rounded-lg border bg-white p-4 shadow-sm ${toneClass[card.tone]}`}>
            <div className="text-sm text-slate-600">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</div>
            {card.hint ? <div className="mt-1 text-xs text-slate-500">{card.hint}</div> : null}
          </div>
        ))}
      </div>

      {d.doctor ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold">My waiting patients</h2>
            {d.doctor.doctorId === null ? (
              <p className="mt-2 text-sm text-slate-500">Your account has no doctor profile yet. Ask an administrator to create one.</p>
            ) : d.doctor.queue.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nobody is waiting. Checked-in patients appear here by token order.</p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {d.doctor.queue.map((item) => (
                  <li key={item.queueId} className="flex items-center justify-between py-2">
                    <span>
                      <span className="mr-2 inline-block rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">#{item.tokenNumber}</span>
                      {item.patientName} <span className="text-slate-500">({item.patientMrn})</span>
                    </span>
                    <span className="text-slate-500">{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link className="mt-3 inline-block text-sm font-medium text-teal-800 hover:underline" href="/consultations">
              Open my clinic
            </Link>
          </Card>
          <Card>
            <h2 className="font-semibold">Unfinalized encounters</h2>
            {d.doctor.draftEncounters.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No drafts. Finalized records are locked from editing.</p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {d.doctor.draftEncounters.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2">
                    <span>{e.patientName}</span>
                    <Link className="text-teal-800 hover:underline" href={`/consultations/${e.id}`}>
                      Continue
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}

      {d.reception ? (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Today&apos;s appointments</h2>
            <Link className="text-sm font-medium text-teal-800 hover:underline" href="/appointments">
              Book or check in
            </Link>
          </div>
          {d.reception.today.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No appointments booked for today yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="py-1">Time</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.reception.today.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-1">{new Date(a.scheduledAt).toISOString().slice(11, 16)}</td>
                    <td>{a.patientName}</td>
                    <td>{a.doctorName}</td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {d.pharmacy ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold">Low stock</h2>
            {d.pharmacy.lowStock.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">All batches are above their reorder level.</p>
            ) : (
              <ul className="mt-2 text-sm">
                {d.pharmacy.lowStock.map((b) => (
                  <li key={`${b.medicine}-${b.batchNumber}`} className="py-1">
                    {b.medicine} · batch {b.batchNumber} · {b.quantityOnHand} left (reorder at {b.reorderLevel})
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Expiring within 90 days</h2>
            {d.pharmacy.expiring.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No batch is near expiry.</p>
            ) : (
              <ul className="mt-2 text-sm">
                {d.pharmacy.expiring.map((b) => (
                  <li key={`${b.medicine}-${b.batchNumber}`} className="py-1">
                    {b.medicine} · batch {b.batchNumber} · {b.quantityOnHand} units · expires {b.expiryDate}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}

      {d.lab ? (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Laboratory pipeline</h2>
            <Link className="text-sm font-medium text-teal-800 hover:underline" href="/lab">
              Open lab worklist
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
            <div>To collect: <strong>{d.lab.toCollect}</strong></div>
            <div>Processing: <strong>{d.lab.processing}</strong></div>
            <div>Awaiting verification: <strong>{d.lab.awaitingVerification}</strong></div>
            <div>Verified today: <strong>{d.lab.completedToday}</strong></div>
          </div>
        </Card>
      ) : null}

      {d.cards.length === 0 ? <Empty title="Nothing is shared with your role yet" hint="Ask an administrator to grant the permissions you need." /> : null}
    </div>
  );
}
