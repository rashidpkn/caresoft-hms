/** Integer-cent money helpers. Never use IEEE floats for totals. */
export function parseRupeesToCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid amount");
    return Math.round(input * 100);
  }
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Amount must have at most 2 decimal places");
  }
  const negative = trimmed.startsWith("-");
  const [whole, frac = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt((frac + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

export function centsToRupees(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

export function addCents(...parts: number[]): number {
  return parts.reduce((sum, n) => {
    if (!Number.isInteger(n)) throw new Error("Money values must be integer cents");
    return sum + n;
  }, 0);
}

export function percentBps(amountCents: number, bps: number): number {
  if (!Number.isInteger(amountCents) || !Number.isInteger(bps)) {
    throw new Error("Tax calculation requires integer cents and basis points");
  }
  // round half away from zero on the extra rupee
  const raw = amountCents * bps;
  return Math.round(raw / 10000);
}

export function lineTotal(params: {
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
  taxBps?: number;
}): { taxCents: number; lineTotalCents: number } {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }
  const gross = params.quantity * params.unitPriceCents;
  const discount = params.discountCents ?? 0;
  if (discount < 0 || discount > gross) throw new Error("Invalid discount");
  const net = gross - discount;
  const taxCents = percentBps(net, params.taxBps ?? 0);
  return { taxCents, lineTotalCents: net + taxCents };
}
