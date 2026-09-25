"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui";
import { useState } from "react";

type Log = { id: string; actorUsername: string | null; actorRole: string | null; action: string; module: string; entity: string; result: string; createdAt: string };

export default function AuditPage() {
  const [qtext, setQ] = useState("");
  const q = useQuery({ queryKey: ["audit", qtext], queryFn: () => api<Log[]>(`audit?q=${encodeURIComponent(qtext)}`) });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-slate-600">Append-only. There is no UI to edit or delete audit records.</p>
      <Input className="mt-3 max-w-md" placeholder="Search action or user" value={qtext} onChange={(e) => setQ(e.target.value)} />
      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b text-slate-500"><tr><th className="py-2">When</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Result</th></tr></thead>
        <tbody>
          {(q.data ?? []).map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2">{new Date(l.createdAt).toLocaleString()}</td>
              <td>{l.actorUsername}</td>
              <td>{l.actorRole}</td>
              <td>{l.action}</td>
              <td>{l.module}</td>
              <td>{l.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
