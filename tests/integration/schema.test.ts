import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

describe("schema migrations", () => {
  it("exposes core HMS tables", async () => {
    const rows = await getDb().execute(sql`
      select tablename from pg_tables where schemaname = 'public' order by tablename
    `);
    const names = (rows as unknown as { tablename: string }[]).map((t) => t.tablename);
    expect(names).toContain("users");
    expect(names).toContain("medicine_batches");
    expect(names).toContain("invoices");
    expect(names).toContain("audit_logs");
    expect(names).toContain("lab_results");
  });
});
