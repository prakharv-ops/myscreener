// Usage: npm run ingest            (reads scripts/tickers.txt, upserts into Supabase `stocks`)
// Data source: yahoo-finance2 (unofficial; fine for personal use, swap provider here if needed).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchDetail } from "./lib/yahoo-detail.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.DRY_RUN && (!url || !key)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false } });

const cli = process.argv.slice(2); // optional: npm run ingest -- AAPL MSFT
const symbols = cli.length ? cli : readFileSync(new URL("./tickers.txt", import.meta.url), "utf8")
  .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
  .filter((s, i, a) => a.indexOf(s) === i); // dedupe

const DRY = Boolean(process.env.DRY_RUN);
const CONCURRENCY = 4;
const BATCH = 50;
if (DRY) console.log("DRY_RUN: not writing to Supabase");

type Row = Awaited<ReturnType<typeof fetchDetail>>;
let pending: Row[] = [];
let saved = 0, failed = 0, next = 0;

async function flush() {
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  if (DRY) return;
  const { error } = await sb.from("stocks").upsert(batch, { onConflict: "symbol" });
  if (error) throw error;
  saved += batch.length;
}

async function worker() {
  while (next < symbols.length) {
    const sym = symbols[next++];
    try {
      const row = await fetchDetail(sym);
      pending.push(row);
      console.log(`ok   ${sym}  (${next}/${symbols.length})`);
      if (DRY) { const { description: _d, ...r } = row; console.log(JSON.stringify(r)); }
      if (pending.length >= BATCH) await flush();
    } catch (e) {
      failed++;
      console.warn(`fail ${sym}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await flush();
console.log(`upserted ${saved}, failed ${failed}, of ${symbols.length}`);
