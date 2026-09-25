"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, Select } from "@/components/ui";

type UserRow = { id: string; username: string; fullName: string; roleName: string; isActive: boolean; lastLoginAt: string | null; employeeId: string };
type Role = { id: string; code: string; name: string };

export default function UsersPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ items: UserRow[] }>("users") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<{ roles: Role[] }>("roles") });
  const [form, setForm] = useState({
    username: "", employeeId: "", fullName: "", password: "Hospital_Temp_1", roleCode: "receptionist",
  });
  const [msg, setMsg] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api("users", { method: "POST", body: JSON.stringify(form) });
      setMsg("User created");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="border-b text-slate-500"><tr><th className="py-2">Username</th><th>Name</th><th>Role</th><th>Active</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {(users.data?.items ?? []).map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.username}</td>
                <td>{u.fullName}</td>
                <td>{u.roleName}</td>
                <td>{u.isActive ? "yes" : "no"}</td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}</td>
                <td>
                  <Button className="px-2 py-1 text-xs" onClick={async () => {
                    await api(`users/${u.id}/active`, { method: "POST", body: JSON.stringify({ isActive: !u.isActive }) });
                    qc.invalidateQueries({ queryKey: ["users"] });
                  }}>{u.isActive ? "Disable" : "Enable"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <h2 className="font-semibold">Create user</h2>
        <form onSubmit={create} className="mt-3 space-y-3">
          <div><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
          <div><Label>Employee ID</Label><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required /></div>
          <div><Label>Full name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
          <div>
            <Label>Role</Label>
            <Select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
              {(roles.data?.roles ?? []).map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
            </Select>
          </div>
          <div><Label>Temporary password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          {msg ? <p className="text-sm">{msg}</p> : null}
          <Button type="submit">Create</Button>
        </form>
      </Card>
    </div>
  );
}
