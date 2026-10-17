import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "./mock";
import { CAP_SIZES } from "./metrics";
import { axisCol, type ScreenResult, type ScreenSpec, type StockRow } from "./screen";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function runScreen(spec: ScreenSpec): Promise<ScreenResult> {
  return url && key ? runSupabase(spec) : runMock(spec);
}

// everything except the long business description and the search vector
const LIST_COLUMNS = "symbol,name,exchange,country,region,sector,industry,currency,price,market_cap,market_cap_usd,pe,forward_pe,pb,peg,ps,ev_ebitda,fcf_yield,eps,roe,roa,gross_margin,operating_margin,profit_margin,debt_to_equity,current_ratio,beta,div_yield,payout_ratio,earnings_growth_past_1y,earnings_growth_past_5y,earnings_growth_est_1y,revenue_growth,analyst_target,analyst_count,analyst_rating,insider_pct,institution_pct,short_pct,avg_volume,employees,pct_from_high,ret_7d,ret_1m,ret_3m,ret_6m,ret_ytd,ret_1y,ret_5y,score_value,score_future,score_past,score_health,score_dividends,score_momentum,score_quality,score_sentiment,score_total,has_details";

async function runSupabase(spec: ScreenSpec): Promise<ScreenResult> {
  const sb = createClient(url!, key!, { auth: { persistSession: false } });
  let q = sb.from("stocks").select(LIST_COLUMNS, { count: "exact" });
  if (spec.markets.length) q = q.in("country", spec.markets);
  if (spec.regions.length) q = q.in("region", spec.regions);
  if (spec.sectors.length) q = q.in("sector", spec.sectors);
  if (spec.industries.length) q = q.in("industry", spec.industries);
  if (spec.capSizes.length) {
    // OR of the selected USD market-cap buckets
    const parts = CAP_SIZES.filter((c) => spec.capSizes.includes(c.key)).map((c) =>
      c.min !== undefined && c.max !== undefined ? `and(market_cap_usd.gte.${c.min},market_cap_usd.lt.${c.max})`
        : c.min !== undefined ? `market_cap_usd.gte.${c.min}` : `market_cap_usd.lt.${c.max}`);
    q = q.or(parts.join(","));
  }
  if (!spec.includeSecondary) q = q.eq("is_primary_listing", true);
  if (spec.detailedOnly) q = q.eq("has_details", true);
  for (const [axis, min] of Object.entries(spec.snowflake)) {
    const col = axisCol(axis);
    if (col && min > 0) q = q.gte(col, min);
  }
  for (const m of spec.metrics) {
    if (m.min !== undefined) q = q.gte(m.key, m.min);
    if (m.max !== undefined) q = q.lte(m.key, m.max);
  }
  if (spec.keywords.trim()) q = q.textSearch("fts", spec.keywords.trim(), { type: "websearch", config: "english" });
  const from = spec.page * spec.pageSize;
  const { data, count, error } = await q
    .order(spec.sort.key, { ascending: spec.sort.dir === "asc", nullsFirst: false })
    .range(from, from + spec.pageSize - 1);
  if (error) throw new Error(error.message);
  return { count: count ?? 0, rows: (data ?? []) as StockRow[], source: "supabase" };
}

function runMock(spec: ScreenSpec): ScreenResult {
  const get = (r: StockRow, k: string) => (r as unknown as Record<string, number | string | null>)[k];
  let rows = mockUniverse();
  if (spec.markets.length) rows = rows.filter((r) => r.country && spec.markets.includes(r.country));
  if (spec.regions.length) rows = rows.filter((r) => r.region && spec.regions.includes(r.region));
  if (spec.sectors.length) rows = rows.filter((r) => r.sector && spec.sectors.includes(r.sector));
  if (spec.industries.length) rows = rows.filter((r) => r.industry && spec.industries.includes(r.industry));
  if (spec.capSizes.length) {
    const sizes = CAP_SIZES.filter((c) => spec.capSizes.includes(c.key));
    rows = rows.filter((r) => r.market_cap_usd != null && sizes.some((c) => (c.min === undefined || r.market_cap_usd! >= c.min) && (c.max === undefined || r.market_cap_usd! < c.max)));
  }
  for (const [axis, min] of Object.entries(spec.snowflake)) {
    const col = axisCol(axis);
    if (col) rows = rows.filter((r) => ((get(r, col) as number) ?? 0) >= min);
  }
  for (const m of spec.metrics) {
    rows = rows.filter((r) => {
      const v = get(r, m.key) as number | null;
      if (v == null) return false;
      return (m.min === undefined || v >= m.min) && (m.max === undefined || v <= m.max);
    });
  }
  const kw = spec.keywords.trim().toLowerCase();
  if (kw) rows = rows.filter((r) => `${r.name} ${r.industry} ${r.description}`.toLowerCase().includes(kw));
  const dir = spec.sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = get(a, spec.sort.key), y = get(b, spec.sort.key);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const from = spec.page * spec.pageSize;
  return { count: rows.length, rows: rows.slice(from, from + spec.pageSize), source: "mock" };
}

/** Every match for a spec (paged internally). Used by alerts. */
export async function allMatches(spec: ScreenSpec, cap = 5000): Promise<StockRow[]> {
  const out: StockRow[] = [];
  for (let page = 0; out.length < cap; page++) {
    const r = await runScreen({ ...spec, page, pageSize: 200 });
    out.push(...r.rows);
    if (out.length >= r.count || !r.rows.length) break;
  }
  return out;
}
