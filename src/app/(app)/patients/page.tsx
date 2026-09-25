"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import Link from "next/link";

type Patient = {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  sex: string;
  dateOfBirth: string;
  phone?: string;
};

export default function PatientsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["patients", q],
    queryFn: () => api<{ items: Patient[] }>(`patients?q=${encodeURIComponent(q)}`),
  });
  const [form, setForm] = useState({
    firstName: "", lastName: "", sex: "female", dateOfBirth: "1990-01-01", phone: "", allergies: "",
  });
  const [msg, setMsg] = useState("");

  async function register(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const created = await api<Patient>("patients", { method: "POST", body: JSON.stringify(form) });
      setMsg(`Registered ${created.mrn}`);
      setForm({ firstName: "", lastName: "", sex: "female", dateOfBirth: "1990-01-01", phone: "", allergies: "" });
      qc.invalidateQueries({ queryKey: ["patients"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Input className="mt-3" placeholder="Search MRN, name, national ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr><th className="py-2">MRN</th><th>Name</th><th>Sex</th><th>DOB</th></tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2"><Link className="text-teal-800 hover:underline" href={`/patients/${p.id}`}>{p.mrn}</Link></td>
                <td>{p.firstName} {p.lastName}</td>
                <td>{p.sex}</td>
                <td>{p.dateOfBirth}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.items?.length === 0 ? <p className="mt-4 text-slate-500">No patients found.</p> : null}
      </div>
      <Card>
        <h2 className="font-semibold">New registration</h2>
        <form onSubmit={register} className="mt-3 space-y-3">
          <div><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
          <div><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          <div>
            <Label>Sex</Label>
            <Select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="unknown">Unknown</option>
            </Select>
          </div>
          <div><Label>Date of birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Allergies</Label><Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Register patient</Button>
        </form>
      </Card>
    </div>
  );
}
