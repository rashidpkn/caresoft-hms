"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, fetchMe } from "@/lib/api";
import { Button, SecondaryButton } from "./ui";

const NAV: { href: string; label: string; anyOf: string[] }[] = [
  { href: "/", label: "Dashboard", anyOf: ["dashboard.view"] },
  { href: "/patients", label: "Patients", anyOf: ["patient.view"] },
  { href: "/appointments", label: "Front desk", anyOf: ["appointment.view"] },
  { href: "/queue", label: "Queue board", anyOf: ["queue.manage", "appointment.checkin"] },
  { href: "/consultations", label: "My clinic", anyOf: ["consultation.view"] },
  { href: "/pharmacy", label: "Pharmacy counter", anyOf: ["pharmacy.sale.create"] },
  { href: "/inventory", label: "Stock & purchases", anyOf: ["inventory.view", "pharmacy.batch.view"] },
  { href: "/billing", label: "Billing", anyOf: ["billing.view"] },
  { href: "/lab", label: "Laboratory", anyOf: ["lab.order.view"] },
  {
    href: "/reports",
    label: "Reports",
    anyOf: ["reports.clinical", "reports.pharmacy", "reports.financial", "reports.lab", "reports.audit"],
  },
  { href: "/users", label: "Staff accounts", anyOf: ["user.view"] },
  { href: "/settings", label: "Settings", anyOf: ["settings.manage"] },
  { href: "/audit", label: "Audit log", anyOf: ["audit.view"] },
  { href: "/system", label: "System health", anyOf: ["health.view"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  if (me.isError) {
    router.replace("/login");
    return null;
  }
  if (me.isLoading || !me.data) {
    return <div className="p-8 text-slate-600">Connecting to HMS server…</div>;
  }
  const perms = new Set(me.data.user.permissions);
  const items = NAV.filter((n) => n.anyOf.some((p) => perms.has(p)));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-100">
        <div className="border-b border-slate-700 px-4 py-4">
          <div className="text-lg font-semibold tracking-tight">Synapse HMS</div>
          <div className="text-xs text-slate-400">Hospital LAN</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 text-sm ${active ? "bg-teal-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-700 p-3 text-xs">
          <div className="font-medium">{me.data.user.fullName}</div>
          <div className="text-slate-400">{me.data.user.roleName}</div>
          <SecondaryButton
            className="mt-2 w-full bg-slate-800 text-white border-slate-600"
            onClick={async () => {
              await api("auth/logout", { method: "POST" });
              router.replace("/login");
            }}
          >
            Sign out
          </SecondaryButton>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">Offline-capable hospital system · PostgreSQL on LAN</div>
          {me.data.user.mustChangePassword ? (
            <Button onClick={() => router.push("/account/password")}>Change password required</Button>
          ) : (
            <Link href="/account/password" className="text-sm text-teal-800 hover:underline">
              Account
            </Link>
          )}
        </header>
        <main className="flex-1 overflow-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
