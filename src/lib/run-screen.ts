import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "./mock";
import { axisCol, type ScreenResult, type ScreenSpec, type StockRow } from "./screen";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function runScreen(spec: ScreenSpec): Promise<ScreenResult> {
  return url && key ? runSupabase(spec) : runMock(spec);
}

async function runSupabase(spec: ScreenSpec): Promise<ScreenResult> {
  const sb = createClient(url!, key!, { auth: { persistSession: false } });
  let q = sb.from("stocks").select("*", { count: "exact" });
  if (spec.markets.length) q = q.in("country", spec.markets);
  if (spec.industries.length) q = q.in("sector", spec.industries);
  if (!spec.includeSecondary) q = q.eq("is_primary_listing", true);
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
  if (spec.industries.length) rows = rows.filter((r) => r.sector && spec.industries.includes(r.sector));
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
