"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

type Health = {
  status: string;
  database: string;
  uptimeSeconds: number;
  memory: { rss: number; systemFree: number };
  lastBackup: { status: string; startedAt: string; verified: boolean } | null;
};
type Backup = { id: string; filename: string; status: string; verified: boolean; startedAt: string; sizeBytes: number | null };

export default function SystemPage() {
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("health") });
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => api<Backup[]>("backups") });
  const h = health.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">System health</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>App: {h?.status ?? "…"}</Card>
        <Card>Database: {h?.database ?? "…"}</Card>
        <Card>Uptime: {h ? Math.round(h.uptimeSeconds / 60) : "…"} min</Card>
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Backups</h2>
          <Button onClick={async () => {
            await api("backups", { method: "POST" });
            qc.invalidateQueries({ queryKey: ["backups"] });
            qc.invalidateQueries({ queryKey: ["health"] });
          }}>Run backup now</Button>
        </div>
        <ul className="mt-3 text-sm">
          {(backups.data ?? []).map((b) => (
            <li key={b.id}>{b.filename} · {b.status} · verified={String(b.verified)} · {new Date(b.startedAt).toLocaleString()}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
