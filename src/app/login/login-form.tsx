"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setCsrf } from "@/lib/api";
import { Button, FieldError, Input, Label } from "@/components/ui";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ user: { mustChangePassword: boolean }; csrfToken: string }>("auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setCsrf(data.csrfToken);
      const next = params.get("next") || "/";
      router.replace(data.user.mustChangePassword ? "/account/password" : next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Synapse HMS</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in with your personal staff account. Shared logins are not permitted.</p>
        <div className="mt-6">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="mt-4">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <FieldError message={error} />
        <Button type="submit" className="mt-6 w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
