"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Input, Label } from "@/components/ui";

export default function PasswordPage() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setMsg("Password changed. Sign in again.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Card className="max-w-md">
      <h1 className="text-xl font-semibold">Change password</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div><Label>Current</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><Label>New</Label><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></div>
        {msg ? <p className="text-sm">{msg}</p> : null}
        <Button type="submit">Update password</Button>
      </form>
    </Card>
  );
}
