import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { regionOf } from "@/lib/regions";
import { computeReturns, epsCagr, estimateFrom, majorOf } from "../scripts/lib/calc.mjs";
import { isFundLike, listingCountry, normName, pickPrimary, type ListingRow } from "../scripts/lib/listings.mjs";
import { QUOTA } from "../scripts/lib/markets.mjs";
import { csv, fixRange, fromHeader, toRows } from "../scripts/lib/parse.mjs";

const DAY = 864e5;

describe("duplicate listings", () => {
  it("knows which country a symbol trades in", () => {
    expect(listingCountry("AAPL")).toBe("United States");
    expect(listingCountry("BRK-B")).toBe("United States");
    expect(listingCountry("2330.TW")).toBe("Taiwan");
    expect(listingCountry("RELIANCE.NS")).toBe("India");
    expect(listingCountry("SHEL.L")).toBe("United Kingdom");
  });

  it("groups listings of the same company by name", () => {
    expect(normName("Alphabet Inc.")).toBe(normName("Alphabet Inc. Class C"));
    expect(normName("Taiwan Semiconductor Manufacturing Company Limited")).toBe(normName("Taiwan Semiconductor Manufacturing Co., Ltd. ADR"));
    expect(normName("Amazon.com, Inc.")).toBe(normName("Amazon.com, Inc. CDR (CAD Hedged)"));
  });

  it("does not merge a holding company with its operating company", () => {
    expect(normName("Samyang Holdings Corporation")).not.toBe(normName("Samyang Corporation"));
    expect(normName("HiteJinro Holdings Co., Ltd.")).not.toBe(normName("HiteJinro Co., Ltd."));
  });

  const row = (o: Partial<ListingRow> & { symbol: string }): ListingRow => ({ name: "X", country: null, industry: null, avg_volume: null, price: null, ...o });

  it("keeps the home-market listing over a foreign ADR", () => {
    const g = [
      row({ symbol: "TSM", country: "Taiwan", avg_volume: 15e6, price: 400 }), // ADR, far more traded in USD
      row({ symbol: "2330.TW", country: "Taiwan", avg_volume: 30e6, price: 2400 }),
    ];
    expect(pickPrimary(g).symbol).toBe("2330.TW");
  });

  it("keeps the more traded share class when both are home listings", () => {
    const g = [
      row({ symbol: "GOOG", country: "United States", avg_volume: 20e6, price: 340 }),
      row({ symbol: "GOOGL", country: "United States", avg_volume: 35e6, price: 340 }),
    ];
    expect(pickPrimary(g).symbol).toBe("GOOGL");
  });

  it("hides funds, trusts and shells but keeps real companies with 'Trust' or 'Funds' in the name", () => {
    expect(isFundLike({ name: "PIMCO Dynamic Income Fund", industry: "Asset Management" })).toBe(true);
    expect(isFundLike({ name: "Sprott Physical Gold Trust", industry: null })).toBe(true);
    expect(isFundLike({ name: "F&C Investment Trust Ord", industry: null })).toBe(true);
    expect(isFundLike({ name: "Some Acquisition Corp", industry: "Shell Companies" })).toBe(true);
    expect(isFundLike({ name: "JPMorgan Global Growth & Income Ord", industry: null })).toBe(true); // UK investment trust
    expect(isFundLike({ name: "Ordina N.V.", industry: null })).toBe(false); // "Ord" only counts as the trailing share-class word
    expect(isFundLike({ name: "Northern Trust Corporation", industry: "Asset Management" })).toBe(false);
    expect(isFundLike({ name: "Digital Realty Trust, Inc.", industry: "REIT - Specialty" })).toBe(false);
    expect(isFundLike({ name: "SBI Funds Management Limited", industry: "Asset Management" })).toBe(false);
    expect(isFundLike({ name: "Sumitomo Mitsui Trust Group, Inc.", industry: "Banks - Regional" })).toBe(false);
  });
});

describe("exchange file parsing", () => {
  it("parses CSV with quoted separators and a BOM", () => {
    const rows = csv('﻿Name;Symbol\n"Shell, plc";SHEL\n"A ""quoted"" co";AQ', ";");
    expect(rows[0]).toEqual(["Name", "Symbol"]);
    expect(rows[1]).toEqual(["Shell, plc", "SHEL"]);
    expect(rows[2][1]).toBe("AQ");
  });

  it("finds the header row below a title block and handles sparse rows", () => {
    // sheet_to_json(header: 1) produces sparse arrays for empty cells
    const sparse: unknown[] = [];
    sparse[0] = "ISIN"; sparse[2] = "Company";
    const rows = fromHeader([["Report title"], [], sparse, ["DE0001", "", "ACME AG"]], "ISIN");
    expect(rows).toEqual([{ ISIN: "DE0001", "": "", Company: "ACME AG" }]);
  });

  it("recovers rows hidden by a wrong sheet dimension (HKEX files declare too few rows)", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Stock Code", "Name"], ["00001", "CKH"], ["00005", "HSBC"], ["09988", "BABA-W"]]);
    ws["!ref"] = "A1:B2"; // claims only 2 rows
    expect(XLSX.utils.sheet_to_json(ws, { header: 1 })).toHaveLength(2);
    expect(toRows(ws)).toHaveLength(4);
    expect(fixRange(ws)["!ref"]).toBe("A1:B4");
  });
});

describe("Yahoo calculations", () => {
  it("uses Yahoo's growth estimate when present, preferring next year", () => {
    expect(estimateFrom([{ period: "0y", growth: 0.18 }, { period: "+1y", growth: 0.0845 }])).toBe(8.45);
    expect(estimateFrom([{ period: "0y", growth: 0.18 }])).toBe(18);
  });

  it("derives growth from EPS estimates when Yahoo leaves it blank (e.g. Japan)", () => {
    const t = [{ period: "+1y", growth: null, earningsEstimate: { avg: 346.84, yearAgoEps: 311.58 } }];
    expect(estimateFrom(t)).toBeCloseTo(11.32, 1);
    expect(estimateFrom([{ period: "+1y", growth: null, earningsEstimate: { avg: 2, yearAgoEps: -1 } }])).toBeNull();
    expect(estimateFrom(undefined)).toBeNull();
  });

  it("computes EPS CAGR and refuses meaningless cases", () => {
    const y = (yr: number, eps: number) => ({ date: new Date(`${yr}-09-30`), dilutedEPS: eps });
    expect(epsCagr([y(2021, 1), y(2025, 2)])).toBeCloseTo(18.9, 0); // doubled over 4 years
    expect(epsCagr([y(2021, -1), y(2025, 2)])).toBeNull(); // starts from a loss
    expect(epsCagr([{ date: new Date("2025-01-31"), dilutedEPS: 1 }, { date: new Date("2025-09-30"), dilutedEPS: 2 }])).toBeNull(); // too short
    expect(epsCagr([{ date: "not a date", dilutedEPS: 1 }, y(2025, 2)])).toBeNull(); // malformed data
    expect(epsCagr([y(2025, 1)])).toBeNull();
  });

  it("computes returns from daily and weekly bars", () => {
    const now = new Date("2026-10-16T00:00:00Z").getTime();
    const daily = Array.from({ length: 11 }, (_, i) => ({ date: new Date(now - (10 - i) * DAY), adjclose: 100 + i })); // 100 -> 110
    const weekly = Array.from({ length: 262 }, (_, i) => ({ date: new Date(now - (261 - i) * 7 * DAY), adjclose: 50 + i })); // ~5 years
    const r = computeReturns(daily, weekly, now);
    expect(r.ret_7d).toBeCloseTo(((110 / 103) - 1) * 100, 1);
    expect(r.ret_5y).toBeCloseTo(((311 / 50) - 1) * 100, 1);
    expect(r.ret_1m).toBeGreaterThan(0);
    expect(r.ret_3m!).toBeGreaterThan(r.ret_1m!);
  });

  it("leaves 5-year return empty for young listings", () => {
    const now = Date.now();
    const weekly = Array.from({ length: 100 }, (_, i) => ({ date: new Date(now - (99 - i) * 7 * DAY), close: 10 }));
    expect(computeReturns([], weekly, now).ret_5y).toBeNull();
  });

  it("knows pence/cents currencies (prices in minor units, market caps in major)", () => {
    expect(majorOf("GBp")).toEqual(["GBP", 0.01]);
    expect(majorOf("ZAc")).toEqual(["ZAR", 0.01]);
    expect(majorOf("USD")).toEqual(["USD", 1]);
  });
});

describe("global universe quotas", () => {
  it("only target countries the app can place in a region", () => {
    for (const c of Object.keys(QUOTA)) expect(regionOf(c)).not.toBe("Other");
  });
});
