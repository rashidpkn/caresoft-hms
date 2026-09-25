import { describe, expect, it } from "vitest";
import { addCents, centsToRupees, lineTotal, parseRupeesToCents, percentBps } from "@/server/money";

describe("money", () => {
  it("parses rupees to integer cents", () => {
    expect(parseRupeesToCents("10.50")).toBe(1050);
    expect(parseRupeesToCents("0.01")).toBe(1);
    expect(parseRupeesToCents(2)).toBe(200);
  });

  it("rejects extra decimal places", () => {
    expect(() => parseRupeesToCents("1.234")).toThrow();
  });

  it("formats cents without float drift", () => {
    expect(centsToRupees(199)).toBe("1.99");
    expect(centsToRupees(0)).toBe("0.00");
  });

  it("adds cents exactly", () => {
    expect(addCents(10, 20, 30)).toBe(60);
    expect(() => addCents(0.1 as unknown as number)).toThrow();
  });

  it("computes tax using basis points", () => {
    expect(percentBps(10000, 1800)).toBe(1800);
    const line = lineTotal({ quantity: 2, unitPriceCents: 350, taxBps: 1200 });
    expect(line.taxCents).toBe(84);
    expect(line.lineTotalCents).toBe(784);
  });
});
