// Usage: npm run rescore   (recomputes Snowflake scores from stored data; no Yahoo calls)
// Handy after tuning src/lib/scoring.ts.
import { createClient } from "@supabase/supabase-js";
import { scoreAll } from "../src/lib/scoring";
import type { StockRow } from "../src/lib/screen";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

// PostgREST returns at most 1000 rows per request, so page through
const all: StockRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("*").eq("has_details", true).order("symbol").range(from, from + 999);
  if (error) throw error;
  all.push(...(data as StockRow[]));
  if (data.length < 1000) break;
}
const rows = all.map((r) => {
  const { fts: _f, ...rest } = r as StockRow & { fts?: unknown };
  return { ...rest, ...scoreAll(r) };
});
for (let i = 0; i < rows.length; i += 100) {
  const { error: e } = await sb.from("stocks").upsert(rows.slice(i, i + 100), { onConflict: "symbol" });
  if (e) throw e;
}
console.log(`rescored ${rows.length} stocks`);
