import { describe, expect, it } from "vitest";
import { AXIS_KEYS, explainAll, explainAxis, lin, scoreAll } from "@/lib/scoring";
import type { StockRow } from "@/lib/screen";

const stock = (o: Partial<StockRow>): Partial<StockRow> => o;

describe("lin", () => {
  it("maps bad -> 0 and good -> 1, linear in between", () => {
    expect(lin(10, 0, 20)).toBe(0.5);
    expect(lin(0, 0, 20)).toBe(0);
    expect(lin(20, 0, 20)).toBe(1);
  });
  it("works when lower is better", () => {
    expect(lin(8, 45, 8)).toBe(1); // PE 8 = full marks
    expect(lin(45, 45, 8)).toBe(0);
  });
  it("clamps outside the range and returns null for missing values", () => {
    expect(lin(100, 0, 20)).toBe(1);
    expect(lin(-5, 0, 20)).toBe(0);
    expect(lin(null, 0, 20)).toBeNull();
    expect(lin(Number.NaN, 0, 20)).toBeNull();
  });
});

describe("axis scores", () => {
  it("are the mean of the checks that have data, on a 0–10 scale", () => {
    const e = explainAxis("quality", stock({ roe: 30, roa: 1 })); // 1 and 0, everything else missing
    expect(e.checks.filter((c) => c.score !== null)).toHaveLength(2);
    expect(e.score).toBe(5);
  });

  it("ignore missing data instead of punishing it, and score 0 with a note when there is none", () => {
    expect(explainAxis("quality", stock({ roe: 30 })).score).toBe(10);
    const empty = explainAxis("quality", stock({}));
    expect(empty.score).toBe(0);
    expect(empty.note).toMatch(/no data/i);
  });

  it("score a loss-making company's PE as 0 rather than skipping it", () => {
    const e = explainAxis("value", stock({ pe: -12 }));
    expect(e.checks.find((c) => c.label === "PE ratio")?.score).toBe(0);
    expect(e.score).toBe(0);
  });

  it("skip non-positive valuation ratios (P/B of a company with negative equity isn't 'cheap')", () => {
    const e = explainAxis("value", stock({ pb: -3, pe: 8 }));
    expect(e.checks.find((c) => c.label === "Price / book")?.score).toBeNull();
    expect(e.score).toBe(10); // only the PE counts
  });

  it("give dividends 0 when there is no dividend", () => {
    const e = explainAxis("dividends", stock({ div_yield: 0, eps: 5, debt_to_equity: 10 }));
    expect(e.score).toBe(0);
    expect(e.note).toMatch(/no dividend/i);
  });

  it("cut implausibly high dividend yields by 60%", () => {
    const normal = explainAxis("dividends", stock({ div_yield: 6, eps: 1, debt_to_equity: 10, payout_ratio: 50 }));
    const trap = explainAxis("dividends", stock({ div_yield: 14, eps: 1, debt_to_equity: 10, payout_ratio: 50 }));
    expect(normal.score).toBe(10);
    expect(trap.score).toBe(4);
    expect(trap.note).toMatch(/warning/i);
  });

  it("treat payouts up to 75% as fully sustainable and >=120% as unsustainable", () => {
    const payout = (p: number) => explainAxis("dividends", stock({ div_yield: 3, payout_ratio: p })).checks.find((c) => c.label === "Payout ratio")?.score;
    expect(payout(60)).toBe(1);
    expect(payout(75)).toBe(1);
    expect(payout(120)).toBe(0);
    expect(payout(97.5)).toBeCloseTo(0.5);
  });

  it("compute analyst upside from price and target", () => {
    const e = explainAxis("sentiment", stock({ price: 100, analyst_target: 135 }));
    const c = e.checks.find((x) => x.label === "Upside to analyst target")!;
    expect(c.value).toBeCloseTo(35);
    expect(c.score).toBe(1);
  });
});

describe("scoreAll", () => {
  const rich = stock({
    price: 100, analyst_target: 120, pe: 15, pb: 2, peg: 1, forward_pe: 13, ps: 2, ev_ebitda: 10, fcf_yield: 5,
    earnings_growth_est_1y: 12, earnings_growth_past_1y: 15, earnings_growth_past_5y: 10, revenue_growth: 8,
    roe: 20, roa: 8, debt_to_equity: 60, market_cap: 50e9, market_cap_usd: 50e9, eps: 4, beta: 1, current_ratio: 1.5,
    div_yield: 2.5, payout_ratio: 40, ret_7d: 1, ret_1m: 3, ret_3m: 6, ret_6m: 10, ret_1y: 20, ret_5y: 80, pct_from_high: -8,
    profit_margin: 15, gross_margin: 45, operating_margin: 20, analyst_rating: 2, analyst_count: 20, short_pct: 2, institution_pct: 60,
  });

  it("returns one score per axis plus a total that is their sum", () => {
    const s = scoreAll(rich);
    const axes = Object.entries(s).filter(([k]) => k !== "score_total").map(([, v]) => v);
    expect(axes).toHaveLength(8);
    expect(s.score_total).toBeCloseTo(axes.reduce((a, b) => a + b, 0), 5);
  });

  it("matches the explanation exactly (the 'why' can't drift from the score)", () => {
    const s = scoreAll(rich) as Record<string, number>;
    const e = explainAll(rich);
    for (const a of AXIS_KEYS) expect(s[`score_${a}`]).toBe(e[a].score);
  });

  it("keeps every axis within 0–10 for random inputs", () => {
    let seed = 7;
    const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 500; i++) {
      const m = Object.fromEntries(Object.keys(rich).map((k) => [k, r() < 0.2 ? null : (r() - 0.3) * 400])) as Partial<StockRow>;
      for (const e of Object.values(explainAll(m))) {
        expect(e.score).toBeGreaterThanOrEqual(0);
        expect(e.score).toBeLessThanOrEqual(10);
        for (const c of e.checks) if (c.score !== null) expect(c.score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
