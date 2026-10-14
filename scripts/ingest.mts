// Usage: npm run ingest            (reads scripts/tickers.txt, upserts into Supabase `stocks`)
// Data source: yahoo-finance2 (unofficial; fine for personal use, swap provider here if needed).
import { readFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";
import { createClient } from "@supabase/supabase-js";
import { scoreAll } from "../src/lib/scoring";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.DRY_RUN && (!url || !key)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false } });
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const cli = process.argv.slice(2); // optional: npm run ingest -- AAPL MSFT
const symbols = cli.length ? cli : readFileSync(new URL("./tickers.txt", import.meta.url), "utf8")
  .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
  .filter((s, i, a) => a.indexOf(s) === i); // dedupe

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pctOf = (v: unknown) => (num(v) == null ? null : +((v as number) * 100).toFixed(2));

const DAY = 864e5;

// Next-year earnings growth estimate (%), falling back to current-year.
async function earningsEstimate(symbol: string) {
  const t = (await yf.quoteSummary(symbol, { modules: ["earningsTrend"] })).earningsTrend?.trend ?? [];
  const g = t.find((x) => x.period === "+1y")?.growth ?? t.find((x) => x.period === "0y")?.growth;
  return pctOf(g);
}

// EPS CAGR (%) over the available annual history (Yahoo gives ~4-5 fiscal years).
async function pastEpsGrowth(symbol: string) {
  const rows = await yf.fundamentalsTimeSeries(symbol, { period1: new Date(Date.now() - 6 * 365 * DAY), type: "annual", module: "financials" });
  const pts = (rows as { date: Date | string | number; dilutedEPS?: number }[])
    .filter((r) => num(r.dilutedEPS) != null)
    .sort((x, y) => +new Date(x.date) - +new Date(y.date));
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const years = (+new Date(b.date) - +new Date(a.date)) / (365.25 * DAY);
  if (years < 1.5 || a.dilutedEPS! <= 0 || b.dilutedEPS! <= 0) return null;
  return +((Math.pow(b.dilutedEPS! / a.dilutedEPS!, 1 / years) - 1) * 100).toFixed(2);
}

// Total returns (%) from adjusted closes: 7D from daily bars, 5Y from weekly bars.
async function returns(symbol: string) {
  const ret = (from: number, to: number) => (from > 0 ? +(((to / from) - 1) * 100).toFixed(2) : null);
  const now = Date.now();
  const [d, w] = await Promise.all([
    yf.chart(symbol, { period1: new Date(now - 14 * DAY), interval: "1d" }),
    yf.chart(symbol, { period1: new Date(now - 5 * 365.25 * DAY - 7 * DAY), interval: "1wk" }),
  ]);
  const px = (q: { adjclose?: number | null; close?: number | null }) => q.adjclose ?? q.close ?? null;
  const dq = d.quotes.filter((q) => px(q) != null);
  const last = dq.at(-1);
  const base = [...dq].reverse().find((q) => last && +q.date <= +last.date - 7 * DAY);
  const ret_7d = last && base ? ret(px(base)!, px(last)!) : null;
  const wq = w.quotes.filter((q) => px(q) != null);
  const first = wq[0], wl = wq.at(-1);
  // require ~5 years of history, otherwise leave null
  const ret_5y = first && wl && +wl.date - +first.date > 4.8 * 365.25 * DAY ? ret(px(first)!, px(wl)!) : null;
  return { ret_7d, ret_5y };
}

async function one(symbol: string) {
  const [est, past5, rets] = await Promise.all([
    earningsEstimate(symbol).catch(() => null),
    pastEpsGrowth(symbol).catch(() => null),
    returns(symbol).catch(() => ({ ret_7d: null, ret_5y: null })),
  ]);
  const s = await yf.quoteSummary(symbol, {
    modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
  });
  const price = s.price, sd = s.summaryDetail, ks = s.defaultKeyStatistics, fd = s.financialData, ap = s.assetProfile;
  const row = {
    symbol,
    name: price?.longName ?? price?.shortName ?? symbol,
    exchange: price?.exchangeName ?? null,
    country: ap?.country ?? null,
    sector: ap?.sector ?? null,
    industry: ap?.industry ?? null,
    currency: price?.currency ?? null,
    description: ap?.longBusinessSummary ?? null,
    price: num(price?.regularMarketPrice),
    market_cap: num(price?.marketCap),
    pe: num(sd?.trailingPE),
    // Yahoo mixes minor units (GBp/ZAc/ILA) with major-unit book value, so P/B is wrong there
    pb: ["GBp", "ZAc", "ILA"].includes(price?.currency ?? "") ? null : num(ks?.priceToBook),
    peg: num(ks?.pegRatio),
    eps: num(ks?.trailingEps),
    roe: pctOf(fd?.returnOnEquity),
    roa: pctOf(fd?.returnOnAssets),
    debt_to_equity: num(fd?.debtToEquity),
    beta: num(sd?.beta ?? ks?.beta),
    div_yield: pctOf(sd?.dividendYield),
    earnings_growth_past_1y: pctOf(fd?.earningsGrowth),
    earnings_growth_est_1y: est,
    earnings_growth_past_5y: past5,
    analyst_target: num(fd?.targetMeanPrice),
    analyst_count: num(fd?.numberOfAnalystOpinions),
    profit_margin: pctOf(fd?.profitMargins),
    analyst_rating: num(fd?.recommendationMean),
    ret_7d: rets.ret_7d,
    ret_1y: pctOf(ks?.["52WeekChange"]),
    ret_5y: rets.ret_5y,
    is_primary_listing: true,
    updated_at: new Date().toISOString(),
  };
  return { ...row, ...scoreAll(row as never) };
}

const DRY = Boolean(process.env.DRY_RUN);
const CONCURRENCY = 4;
const BATCH = 50;
if (DRY) console.log("DRY_RUN: not writing to Supabase");

type Row = Awaited<ReturnType<typeof one>>;
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
      const row = await one(sym);
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
