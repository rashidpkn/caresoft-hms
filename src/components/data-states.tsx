import { Card } from "./ui";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-6 text-sm text-slate-500">{label}</p>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="border-dashed bg-slate-50 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </Card>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export function SuccessNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
      {message}
    </p>
  );
}
