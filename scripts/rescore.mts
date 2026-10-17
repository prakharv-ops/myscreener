// Usage: npm run rescore   (recomputes Snowflake scores from stored data; no Yahoo calls)
// Builds fresh peer statistics first, so industry-relative checks reflect the current universe.
// Reads only the columns scoring needs and writes back only the scores (whole-row rewrites hit statement timeouts).
import { createClient } from "@supabase/supabase-js";
import { SCORE_INPUT_COLUMNS, scoreAll } from "../src/lib/scoring";
import type { StockRow } from "../src/lib/screen";
import { loadPeerStats } from "./lib/peers-db.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const peers = await loadPeerStats(sb);
console.log(`peer stats: ${peers.industry.size} industries, ${peers.sector.size} sectors`);

const rows: (Partial<StockRow> & { symbol: string; name: string })[] = [];
const cols = ["symbol", "name", ...SCORE_INPUT_COLUMNS].join(",");
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select(cols).eq("has_details", true).order("symbol").range(from, from + 999);
  if (error) throw error;
  rows.push(...(data as unknown as typeof rows));
  if (data.length < 1000) break;
}

let done = 0;
const out = rows.map((r) => ({ symbol: r.symbol, name: r.name, ...scoreAll(r, peers) }));
for (let i = 0; i < out.length; i += 250) {
  const { error } = await sb.from("stocks").upsert(out.slice(i, i + 250), { onConflict: "symbol" });
  if (error) throw error;
  done += Math.min(250, out.length - i);
}
console.log(`rescored ${done} stocks`);
