import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sequences } from "@/db/schema";

export async function nextFormattedNumber(
  tx: Db | Parameters<Db["transaction"]>[0] extends (t: infer T) => unknown ? T : Db,
  key: string,
): Promise<string> {
  const client = tx as Db;
  const rows = await client.select().from(sequences).where(eq(sequences.key, key)).for("update");
  const row = rows[0];
  if (!row) {
    throw new Error(`Missing sequence ${key}`);
  }
  const next = row.lastValue + 1;
  await client.update(sequences).set({ lastValue: next }).where(eq(sequences.key, key));
  const year = new Date().getFullYear();
  return `${row.prefix}${year}${String(next).padStart(row.padding, "0")}`;
}

export async function ensureSequences(db: Db): Promise<void> {
  const defaults = [
    { key: "patient_mrn", prefix: "MRN", padding: 6 },
    { key: "invoice", prefix: "INV", padding: 6 },
    { key: "payment", prefix: "PAY", padding: 6 },
    { key: "refund", prefix: "RFD", padding: 6 },
    { key: "purchase", prefix: "PUR", padding: 6 },
    { key: "prescription", prefix: "RX", padding: 6 },
    { key: "lab_order", prefix: "LAB", padding: 6 },
    { key: "lab_sample", prefix: "SMP", padding: 6 },
  ];
  for (const d of defaults) {
    await db.execute(sql`
      INSERT INTO sequences (key, prefix, last_value, padding)
      VALUES (${d.key}, ${d.prefix}, 0, ${d.padding})
      ON CONFLICT (key) DO NOTHING
    `);
  }
}
