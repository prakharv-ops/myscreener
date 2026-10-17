import { describe, expect, it } from "vitest";
import { CAP_SIZES, METRICS, SNOWFLAKE_AXES, SORTABLE } from "@/lib/metrics";
import { PRESETS } from "@/lib/presets";
import { REGIONS, regionOf } from "@/lib/regions";
import { allMatches, runScreen } from "@/lib/run-screen";
import { ScreenSpec } from "@/lib/screen";
import { fmtCap, fmtMetric, pct } from "@/lib/format";

const spec = (o: object = {}) => ScreenSpec.parse(o);

describe("ScreenSpec validation", () => {
  it("fills sensible defaults", () => {
    const s = spec();
    expect(s.sort).toEqual({ key: "market_cap_usd", dir: "desc" });
    expect(s.detailedOnly).toBe(true);
    expect(s.includeSecondary).toBe(false);
    expect(s.page).toBe(0);
    expect(s.pageSize).toBe(50);
  });

  it("rejects unknown metrics, unsortable columns, out-of-range snowflake minimums and oversized pages", () => {
    expect(ScreenSpec.safeParse({ metrics: [{ key: "drop table" }] }).success).toBe(false);
    expect(ScreenSpec.safeParse({ sort: { key: "description", dir: "asc" } }).success).toBe(false);
    expect(ScreenSpec.safeParse({ snowflake: { value: 11 } }).success).toBe(false);
    expect(ScreenSpec.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(ScreenSpec.safeParse({ capSizes: ["giant"] }).success).toBe(false);
  });

  it("lets every metric and snowflake axis be sorted on", () => {
    for (const m of METRICS) expect(SORTABLE.has(m.key)).toBe(true);
    for (const a of SNOWFLAKE_AXES) expect(SORTABLE.has(a.col)).toBe(true);
  });
});

describe("runScreen (mock data)", () => {
  it("uses mock data when Supabase isn't configured", async () => {
    const r = await runScreen(spec());
    expect(r.source).toBe("mock");
    expect(r.count).toBeGreaterThan(100);
    expect(r.rows).toHaveLength(50);
  });

  it("applies snowflake minimums", async () => {
    const r = await runScreen(spec({ snowflake: { quality: 6 }, pageSize: 200 }));
    expect(r.count).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.score_quality).toBeGreaterThanOrEqual(6);
  });

  it("applies metric ranges (inclusive) and drops rows missing the metric", async () => {
    const r = await runScreen(spec({ metrics: [{ key: "pe", min: 10, max: 20 }], pageSize: 200 }));
    for (const row of r.rows) {
      expect(row.pe).not.toBeNull();
      expect(row.pe!).toBeGreaterThanOrEqual(10);
      expect(row.pe!).toBeLessThanOrEqual(20);
    }
  });

  it("applies USD company-size buckets with half-open boundaries", async () => {
    const r = await runScreen(spec({ capSizes: ["large"], pageSize: 200 }));
    const large = CAP_SIZES.find((c) => c.key === "large")!;
    expect(r.count).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.market_cap_usd!).toBeGreaterThanOrEqual(large.min!);
      expect(row.market_cap_usd!).toBeLessThan(large.max!);
    }
  });

  it("filters by region and country", async () => {
    const r = await runScreen(spec({ regions: ["Asia-Pacific"], pageSize: 200 }));
    expect(r.count).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.region).toBe("Asia-Pacific");
    const india = await runScreen(spec({ markets: ["India"], pageSize: 200 }));
    for (const row of india.rows) expect(row.country).toBe("India");
  });

  it("sorts in both directions and pages without overlap", async () => {
    const desc = await runScreen(spec({ sort: { key: "roe", dir: "desc" }, pageSize: 20 }));
    const vals = desc.rows.map((r) => r.roe!);
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
    const asc = await runScreen(spec({ sort: { key: "roe", dir: "asc" }, pageSize: 20 }));
    expect(asc.rows[0].roe!).toBeLessThanOrEqual(desc.rows.at(-1)!.roe!);

    const p0 = await runScreen(spec({ page: 0, pageSize: 25 }));
    const p1 = await runScreen(spec({ page: 1, pageSize: 25 }));
    const overlap = p0.rows.filter((a) => p1.rows.some((b) => b.symbol === a.symbol));
    expect(overlap).toHaveLength(0);
  });

  it("allMatches returns every match across pages", async () => {
    const s = spec({ snowflake: { health: 3 } });
    const { count } = await runScreen(s);
    const all = await allMatches(s);
    expect(all).toHaveLength(count);
    expect(new Set(all.map((r) => r.symbol)).size).toBe(count);
  });
});

describe("investing-idea presets", () => {
  const axisKeys = new Set<string>(SNOWFLAKE_AXES.map((a) => a.key));
  const metricKeys = new Set(METRICS.map((m) => m.key));

  it("have unique ids", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  for (const p of PRESETS) {
    it(`"${p.title}" is a valid screen`, () => {
      expect(ScreenSpec.safeParse({ ...p.filters, sort: p.sort }).success).toBe(true);
      for (const k of Object.keys(p.filters.snowflake ?? {})) expect(axisKeys.has(k)).toBe(true);
      for (const m of p.filters.metrics ?? []) expect(metricKeys.has(m.key)).toBe(true);
      for (const r of p.filters.regions ?? []) expect(REGIONS).toContain(r);
      expect(SORTABLE.has(p.sort.key)).toBe(true);
    });
  }
});

describe("regions", () => {
  it("maps countries to regions", () => {
    expect(regionOf("United States")).toBe("North America");
    expect(regionOf("Japan")).toBe("Asia-Pacific");
    expect(regionOf("Germany")).toBe("Europe");
    expect(regionOf("Brazil")).toBe("Latin America");
    expect(regionOf("Israel")).toBe("Middle East & Africa");
    expect(regionOf("Atlantis")).toBe("Other");
    expect(regionOf(null)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats market caps, percentages and metrics", () => {
    expect(fmtCap(5.17e12)).toBe("5.17t");
    expect(fmtCap(191.7e9)).toBe("191.7b");
    expect(fmtCap(32e6)).toBe("32m");
    expect(fmtCap(null)).toBe("–");
    expect(pct(12.345)).toBe("12.3%");
    expect(fmtMetric("market_cap_usd", 2e12)).toBe("$2.00t");
    expect(fmtMetric("roe", 18.25)).toBe("18.3%");
    expect(fmtMetric("pe", null)).toBe("–");
  });
});
