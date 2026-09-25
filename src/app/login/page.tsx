import type { Metadata } from "next";
import LoginForm from "./login-form";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Sign in · Synapse HMS" };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
