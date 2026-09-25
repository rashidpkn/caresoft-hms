"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Input, Label, SecondaryButton, Select } from "@/components/ui";
import { Empty, ErrorNote, Loading, SuccessNote } from "@/components/data-states";
import { useSession } from "@/lib/use-session";
import { formatMoney } from "@/lib/utils";

type StockRow = {
  batchId: string;
  batchNumber: string;
  medicineName: string;
  genericName: string | null;
  sku: string;
  unit: string;
  strength: string | null;
  quantityAvailable: number;
  unitPriceCents: number;
  gstBps: number;
  expiryDate: string;
};
type Patient = { id: string; mrn: string; firstName: string; lastName: string };
type Sale = { id: string; invoiceNo: string; status: string; totalCents: number; paidCents: number; refundedCents: number; createdAt: string };
type SaleDetail = {
  invoice: { id: string; invoiceNo: string; totalCents: number; paidCents: number; refundedCents: number; status: string };
  items: { id: string; description: string; quantity: number; unitPriceCents: number; batchId: string | null; returnableQuantity: number }[];
};

export default function PharmacyPage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [cart, setCart] = useState<{ batchId: string; quantity: number }[]>([]);
  const [discountRupees, setDiscountRupees] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notice, setNotice] = useState("");
  const [returnInvoiceId, setReturnInvoiceId] = useState("");
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");

  const stock = useQuery({ queryKey: ["stock", search], queryFn: () => api<StockRow[]>(`pharmacy/stock?q=${encodeURIComponent(search)}`) });
  const patients = useQuery({
    queryKey: ["patients", patientQuery],
    queryFn: () => api<{ items: Patient[] }>(`patients?q=${encodeURIComponent(patientQuery)}`),
    enabled: can("patient.view"),
  });
  const sales = useQuery({ queryKey: ["pharmacy-sales"], queryFn: () => api<Sale[]>("pharmacy/sales") });
  const saleDetail = useQuery({
    queryKey: ["pharmacy-sale", returnInvoiceId],
    queryFn: () => api<SaleDetail>(`pharmacy/sales/${returnInvoiceId}`),
    enabled: Boolean(returnInvoiceId),
  });

  const rows = useMemo(() => stock.data ?? [], [stock.data]);
  const cartLines = useMemo(
    () =>
      cart
        .map((line) => {
          const batch = rows.find((r) => r.batchId === line.batchId);
          if (!batch) return null;
          const gross = batch.unitPriceCents * line.quantity;
          const tax = Math.round((gross * batch.gstBps) / 10000);
          return { ...line, batch, gross, tax, total: gross + tax };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [cart, rows],
  );
  const subtotal = cartLines.reduce((sum, l) => sum + l.gross, 0);
  const taxTotal = cartLines.reduce((sum, l) => sum + l.tax, 0);
  const discountCents = Math.max(0, Math.round(Number(discountRupees || "0") * 100));
  const payable = Math.max(0, subtotal - discountCents + taxTotal);

  const sell = useMutation({
    mutationFn: () =>
      api<{ id: string; invoiceNo: string; totalCents: number; status: string }>("pharmacy/sales", {
        method: "POST",
        body: JSON.stringify({
          patientId: patientId || null,
          items: cart,
          discountCents,
          paymentMethod,
          amountTenderedCents: payable,
        }),
      }),
    onSuccess: (invoice) => {
      setNotice(`Bill ${invoice.invoiceNo} completed for ${formatMoney(invoice.totalCents)} (${invoice.status}).`);
      setCart([]);
      setDiscountRupees("0");
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const doReturn = useMutation({
    mutationFn: () => {
      const items = Object.entries(returnQty)
        .map(([batchId, qty]) => ({ batchId, quantity: Number(qty) }))
        .filter((i) => i.quantity > 0);
      if (items.length === 0) throw new Error("Enter at least one quantity to return");
      return api<{ goodsValueCents: number; cashRefundedCents: number }>("pharmacy/returns", {
        method: "POST",
        body: JSON.stringify({ invoiceId: returnInvoiceId, items, reason: returnReason }),
      });
    },
    onSuccess: (res) => {
      setNotice(`Return accepted. Goods ${formatMoney(res.goodsValueCents)}, cash refunded ${formatMoney(res.cashRefundedCents)}.`);
      setReturnQty({});
      setReturnReason("");
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-sales"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-sale", returnInvoiceId] });
    },
  });

  function addToCart(batchId: string) {
    const batch = rows.find((r) => r.batchId === batchId);
    if (!batch) return;
    setCart((prev) => {
      const existing = prev.find((p) => p.batchId === batchId);
      if (!existing) return [...prev, { batchId, quantity: 1 }];
      if (existing.quantity >= batch.quantityAvailable) return prev;
      return prev.map((p) => (p.batchId === batchId ? { ...p, quantity: p.quantity + 1 } : p));
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pharmacy counter</h1>
        <p className="text-sm text-slate-600">Expired batches are hidden and stock is listed expiry-first so the oldest usable batch is dispensed.</p>
      </div>

      <SuccessNote message={notice} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div>
            <Label htmlFor="stock-search">Search medicine</Label>
            <Input id="stock-search" placeholder="Name, generic or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {stock.isLoading ? (
            <Loading label="Loading stock…" />
          ) : rows.length === 0 ? (
            <Empty title="No dispensable stock" hint="Store manager must receive a purchase before dispensing." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="py-2">Medicine</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.batchId} className="border-b">
                    <td className="py-2">
                      {r.medicineName}
                      <div className="text-xs text-slate-500">
                        {r.sku}
                        {r.strength ? ` · ${r.strength}` : ""}
                      </div>
                    </td>
                    <td>{r.batchNumber}</td>
                    <td>{r.expiryDate}</td>
                    <td className="text-right">{r.quantityAvailable}</td>
                    <td className="text-right">{formatMoney(r.unitPriceCents)}</td>
                    <td className="text-right">
                      {can("pharmacy.sale.create") ? (
                        <Button className="px-2 py-1 text-xs" onClick={() => addToCart(r.batchId)}>
                          Add
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {can("pharmacy.sale.create") ? (
          <Card>
            <h2 className="font-semibold">Current bill</h2>
            <div className="mt-3 space-y-3">
              {can("patient.view") ? (
                <>
                  <div>
                    <Label htmlFor="pat-q">Link patient (optional)</Label>
                    <Input id="pat-q" placeholder="MRN or name" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
                  </div>
                  <Select aria-label="Patient" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                    <option value="">Walk-in customer</option>
                    {(patients.data?.items ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.mrn} · {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </Select>
                </>
              ) : null}

              {cartLines.length === 0 ? (
                <p className="text-sm text-slate-500">Cart is empty.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {cartLines.map((line) => (
                    <li key={line.batchId} className="rounded border border-slate-200 p-2">
                      <div className="font-medium">{line.batch.medicineName}</div>
                      <div className="text-xs text-slate-500">
                        batch {line.batch.batchNumber} · max {line.batch.quantityAvailable}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          aria-label={`Quantity for ${line.batch.medicineName}`}
                          type="number"
                          min={1}
                          max={line.batch.quantityAvailable}
                          className="w-20"
                          value={line.quantity}
                          onChange={(e) => {
                            const next = Math.max(1, Math.min(line.batch.quantityAvailable, Number(e.target.value) || 1));
                            setCart((prev) => prev.map((p) => (p.batchId === line.batchId ? { ...p, quantity: next } : p)));
                          }}
                        />
                        <span>{formatMoney(line.total)}</span>
                        <SecondaryButton
                          className="ml-auto px-2 py-1 text-xs"
                          onClick={() => setCart((prev) => prev.filter((p) => p.batchId !== line.batchId))}
                        >
                          Remove
                        </SecondaryButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <Label htmlFor="discount">Discount (₹)</Label>
                <Input id="discount" inputMode="decimal" value={discountRupees} onChange={(e) => setDiscountRupees(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="method">Payment method</Label>
                <Select id="method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                </Select>
              </div>

              <dl className="space-y-1 border-t pt-2 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>-{formatMoney(discountCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>GST</dt>
                  <dd>{formatMoney(taxTotal)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Payable</dt>
                  <dd>{formatMoney(payable)}</dd>
                </div>
              </dl>

              <ErrorNote error={sell.error} />
              <Button className="w-full" disabled={cart.length === 0 || sell.isPending} onClick={() => sell.mutate()}>
                {sell.isPending ? "Completing…" : "Complete sale"}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Recent pharmacy bills</h2>
          {(sales.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No pharmacy bills yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="py-1">Bill</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(sales.data ?? []).map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-1">
                      <Link className="text-teal-800 hover:underline" href={`/billing/${s.id}`}>
                        {s.invoiceNo}
                      </Link>
                    </td>
                    <td>{formatMoney(s.totalCents)}</td>
                    <td>{s.status}</td>
                    <td className="text-right">
                      {can("pharmacy.sale.refund") ? (
                        <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setReturnInvoiceId(s.id)}>
                          Return
                        </SecondaryButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {can("pharmacy.sale.refund") ? (
          <Card>
            <h2 className="font-semibold">Sale return</h2>
            {!returnInvoiceId ? (
              <p className="mt-2 text-sm text-slate-500">Pick a bill on the left to return dispensed items.</p>
            ) : saleDetail.isLoading ? (
              <Loading />
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  Bill <strong>{saleDetail.data?.invoice.invoiceNo}</strong> · paid {formatMoney(saleDetail.data?.invoice.paidCents ?? 0)}
                </p>
                {(saleDetail.data?.items ?? []).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">
                      {item.description}
                      <span className="block text-xs text-slate-500">returnable {item.returnableQuantity}</span>
                    </span>
                    <Input
                      aria-label={`Return quantity for ${item.description}`}
                      type="number"
                      min={0}
                      max={item.returnableQuantity}
                      className="w-20"
                      value={item.batchId ? returnQty[item.batchId] ?? "" : ""}
                      disabled={!item.batchId || item.returnableQuantity === 0}
                      onChange={(e) => item.batchId && setReturnQty({ ...returnQty, [item.batchId]: e.target.value })}
                    />
                  </div>
                ))}
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Input id="reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Patient returned unused strip" />
                </div>
                <ErrorNote error={doReturn.error} />
                <Button disabled={!returnReason.trim() || doReturn.isPending} onClick={() => doReturn.mutate()}>
                  Accept return
                </Button>
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
