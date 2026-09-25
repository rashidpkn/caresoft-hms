"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label } from "@/components/ui";
import { useState } from "react";

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<Record<string, unknown>>("settings") });
  const hospital = (q.data?.hospital ?? {}) as { name?: string; address?: string; phone?: string };
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">System settings</h1>
      <Card>
        <p className="text-sm text-slate-600">Current hospital name: {hospital.name ?? "—"}</p>
        <Label className="mt-3">Hospital name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={hospital.name} />
        <Button className="mt-3" onClick={async () => {
          await api("settings", { method: "POST", body: JSON.stringify({ key: "hospital", value: { ...hospital, name } }) });
          setMsg("Saved");
          qc.invalidateQueries({ queryKey: ["settings"] });
        }}>Save</Button>
        {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
      </Card>
    </div>
  );
}
