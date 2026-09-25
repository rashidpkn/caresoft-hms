"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, fetchMe } from "@/lib/api";
import { Button, SecondaryButton } from "./ui";

const NAV: { href: string; label: string; permission: string }[] = [
  { href: "/", label: "Dashboard", permission: "dashboard.view" },
  { href: "/patients", label: "Patients", permission: "patient.view" },
  { href: "/appointments", label: "Appointments", permission: "appointment.view" },
  { href: "/queue", label: "Queue", permission: "appointment.view" },
  { href: "/consultations", label: "Consultation", permission: "consultation.view" },
  { href: "/pharmacy", label: "Pharmacy", permission: "pharmacy.medicine.view" },
  { href: "/inventory", label: "Inventory", permission: "inventory.view" },
  { href: "/billing", label: "Billing", permission: "billing.view" },
  { href: "/lab", label: "Laboratory", permission: "lab.order.view" },
  { href: "/reports", label: "Reports", permission: "reports.clinical" },
  { href: "/users", label: "Users", permission: "user.view" },
  { href: "/settings", label: "Settings", permission: "settings.manage" },
  { href: "/audit", label: "Audit", permission: "audit.view" },
  { href: "/system", label: "System", permission: "health.view" },
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
  const items = NAV.filter((n) => perms.has(n.permission) || (n.href === "/reports" && (perms.has("reports.pharmacy") || perms.has("reports.financial") || perms.has("reports.lab") || perms.has("reports.audit") || perms.has("reports.clinical"))));

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
