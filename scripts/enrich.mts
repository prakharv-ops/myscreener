// Usage: npm run enrich [-- --minutes 30] [-- --limit 500]
// Fills in full details (sector, ROE, margins, growth, returns, scores...) for rows that lack them,
// biggest companies first, then refreshes the stalest ones. Time-boxed so it can run nightly;
// the whole US universe fills in over a few nights. Symbols that keep failing are skipped after 3 tries.
import { createClient } from "@supabase/supabase-js";
import { fetchDetail } from "./lib/yahoo-detail.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const MINUTES = arg("minutes", Number(process.env.ENRICH_MINUTES ?? 30));
const LIMIT = arg("limit", 100000);
const STALE_DAYS = Number(process.env.ENRICH_STALE_DAYS ?? 3);
const deadline = Date.now() + MINUTES * 60_000;

// queue: never-enriched first (largest market cap first), then stale ones (oldest first)
const fresh = await sb.from("stocks").select("symbol").eq("has_details", false).lt("detail_failures", 3)
  .order("market_cap", { ascending: false, nullsFirst: false }).limit(20000);
if (fresh.error) throw fresh.error;
const stale = await sb.from("stocks").select("symbol").eq("has_details", true)
  .lt("details_updated_at", new Date(Date.now() - STALE_DAYS * 864e5).toISOString())
  .order("details_updated_at", { ascending: true }).limit(20000);
if (stale.error) throw stale.error;
const queue = [...fresh.data, ...stale.data].map((r) => r.symbol).slice(0, LIMIT);
console.log(`queue: ${fresh.data.length} new + ${stale.data.length} stale; budget ${MINUTES} min`);

let ok = 0, failed = 0, i = 0;
let batch: Record<string, unknown>[] = [];
const flush = async () => {
  if (!batch.length) return;
  const rows = batch;
  batch = [];
  const { error } = await sb.from("stocks").upsert(rows, { onConflict: "symbol" });
  if (error) throw error;
};

async function worker() {
  while (i < queue.length && Date.now() < deadline) {
    const sym = queue[i++];
    try {
      batch.push(await fetchDetail(sym));
      ok++;
      if (batch.length >= 25) await flush();
    } catch (e) {
      failed++;
      const { data } = await sb.from("stocks").select("detail_failures").eq("symbol", sym).single();
      await sb.from("stocks").update({ detail_failures: (data?.detail_failures ?? 0) + 1 }).eq("symbol", sym);
      if (failed <= 10) console.warn(`fail ${sym}: ${(e as Error).message.slice(0, 100)}`);
    }
    if ((ok + failed) % 100 === 0) console.log(`  ${ok + failed}/${queue.length} (ok ${ok}, failed ${failed})`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await flush();
console.log(`enriched ${ok}, failed ${failed}, remaining in queue ${Math.max(0, queue.length - i)}`);
