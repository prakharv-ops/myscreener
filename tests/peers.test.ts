import { describe, expect, it } from "vitest";
import { buildPeerStats, MIN_PEERS, peerScore } from "@/lib/peers";
import { explainAxis, scoreAll } from "@/lib/scoring";

// 20 banks on PE 6..25 and 20 software firms on PE 20..96, plus a tiny industry with 3 members
const banks = Array.from({ length: 20 }, (_, i) => ({ industry: "Banks", sector: "Financials", pe: 6 + i, gross_margin: null, profit_margin: 25 + i * 0.5 }));
const software = Array.from({ length: 20 }, (_, i) => ({ industry: "Software", sector: "Technology", pe: 20 + i * 4, profit_margin: 10 + i, gross_margin: 60 + i }));
const tiny = Array.from({ length: 3 }, (_, i) => ({ industry: "Abacus Makers", sector: "Technology", pe: 30 + i }));
const stats = buildPeerStats([...banks, ...software, ...tiny]);

describe("peer ranking", () => {
  it("ranks a value within its own industry (lower PE = better)", () => {
    const cheapBank = peerScore(stats, { industry: "Banks", sector: "Financials", pe: 7 } as never, "pe")!;
    expect(cheapBank.group).toBe("industry");
    expect(cheapBank.n).toBe(20);
    expect(cheapBank.score).toBeGreaterThan(0.9);
  });

  it("the same PE is cheap for software but expensive for a bank", () => {
    const sw = peerScore(stats, { industry: "Software", pe: 24 } as never, "pe")!;
    const bank = peerScore(stats, { industry: "Banks", pe: 24 } as never, "pe")!;
    expect(sw.score).toBeGreaterThan(0.9);
    expect(bank.score).toBeLessThan(0.1);
  });

  it("falls back to the sector, then the market, when the industry is too small", () => {
    const r = peerScore(stats, { industry: "Abacus Makers", sector: "Technology", pe: 31 } as never, "pe")!;
    expect(r.group).toBe("sector"); // 3 abacus makers < MIN_PEERS, but Technology has 23
    expect(r.n).toBeGreaterThanOrEqual(MIN_PEERS);
    const m = peerScore(stats, { industry: "Nowhere", sector: "Nothing", pe: 31 } as never, "pe")!;
    expect(m.group).toBe("market");
    expect(m.n).toBe(43);
  });

  it("higher-is-better metrics rank the other way", () => {
    const fat = peerScore(stats, { industry: "Software", profit_margin: 29 } as never, "profit_margin")!;
    const thin = peerScore(stats, { industry: "Software", profit_margin: 10 } as never, "profit_margin")!;
    expect(fat.score).toBeGreaterThan(thin.score);
  });

  it("doesn't rank non-comparable values (negative multiples) or missing data", () => {
    expect(peerScore(stats, { industry: "Banks", pe: -5 } as never, "pe")).toBeNull();
    expect(peerScore(stats, { industry: "Banks", pe: null } as never, "pe")).toBeNull();
    expect(peerScore(undefined, { industry: "Banks", pe: 10 } as never, "pe")).toBeNull();
  });

  it("gives ties the middle rank", () => {
    const flat = buildPeerStats(Array.from({ length: 20 }, () => ({ industry: "Flat", pe: 10 })));
    expect(peerScore(flat, { industry: "Flat", pe: 10 } as never, "pe")!.score).toBeCloseTo(0.5);
  });
});

describe("sector-relative scoring", () => {
  it("adds industry checks to Value and explains them", () => {
    const e = explainAxis("value", { industry: "Banks", sector: "Financials", pe: 7 }, stats);
    const c = e.checks.find((x) => x.label === "PE vs industry")!;
    expect(c.score).toBeGreaterThan(0.9);
    expect(c.peer).toMatchObject({ group: "industry", groupName: "Banks", n: 20 });
    expect(c.rule).toMatch(/better than \d+% of 20 Banks peers/);
  });

  it("stops penalising low-margin industries in Quality", () => {
    // a grocer with the best margin among grocers vs a software firm with the worst margin among software firms
    const grocers = Array.from({ length: 20 }, (_, i) => ({ industry: "Grocery", profit_margin: 1 + i * 0.15, gross_margin: 20 + i * 0.5 }));
    const s = buildPeerStats([...grocers, ...software]);
    const bestGrocer = scoreAll({ industry: "Grocery", profit_margin: 3.8, gross_margin: 29.5 }, s).score_quality;
    const worstSoftware = scoreAll({ industry: "Software", profit_margin: 10, gross_margin: 60 }, s).score_quality;
    expect(bestGrocer).toBeGreaterThan(worstSoftware);
  });

  it("without peer stats, relative checks are skipped and say why", () => {
    const c = explainAxis("value", { industry: "Banks", pe: 7 }).checks.find((x) => x.label === "PE vs industry")!;
    expect(c.score).toBeNull();
    expect(c.rule).toMatch(/peer data unavailable/);
  });
});
