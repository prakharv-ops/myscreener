// Shared Yahoo "full details" fetch + scoring used by ingest.mts and enrich.mts.
import YahooFinance from "yahoo-finance2";
import { regionOf } from "../../src/lib/regions";
import type { PeerStats } from "../../src/lib/peers";
import { scoreAll } from "../../src/lib/scoring";
import { capToUsd, loadFx } from "./fx.mjs";
import { computeReturns, epsCagr, estimateFrom, num, pctOf } from "./calc.mjs";

// yahoo-finance2 console.error()s the full request URL on every non-2xx response (no option to disable).
// Expected misses (delisted symbols, rate limits) would otherwise bloat the logs by megabytes per run.
const origError = console.error;
console.error = (...args: unknown[]) => {
  if (args.length === 1 && typeof args[0] === "string" && args[0].startsWith("https://query")) return;
  origError(...args);
};

const quiet = { info() {}, warn() {}, error() {}, debug() {}, dir() {} }; // the library dumps full request URLs on errors
export const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], logger: quiet });

// ---------- shared pacing + retry for every Yahoo call ----------
// Each stock needs ~4 Yahoo requests and enrich runs 4 workers. Unpaced, that trips Yahoo's throttling, and a
// throttled sub-request used to be swallowed as "no data". Now: one shared request pace for the whole process,
// a global cool-down when Yahoo says "too many requests", and retries with backoff. Only genuine "no data"
// answers are treated as empty; anything else fails the stock so it is retried later.
const GAP_MS = Number(process.env.YAHOO_GAP_MS ?? 125); // ~8 requests/second across all workers
let nextSlot = 0;
let coolUntil = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const isNoData = (e: unknown) => /not found|no fundamentals|no data|delisted|invalid symbol/i.test(String((e as Error)?.message));
const isThrottle = (e: unknown) => /too many requests|429|set-cookie|crumb|rate limit|ECONNRESET|socket hang up|fetch failed/i.test(String((e as Error)?.message));

async function slot() {
  for (;;) {
    const now = Date.now();
    if (coolUntil > now) { await sleep(coolUntil - now); continue; }
    const at = Math.max(now, nextSlot);
    nextSlot = at + GAP_MS;
    if (at > now) await sleep(at - now);
    return;
  }
}

/** Run one Yahoo request with pacing, a global cool-down on throttling and up to `tries` attempts. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    await slot();
    try {
      return await fn();
    } catch (e) {
      if (isNoData(e) || attempt >= tries) throw e;
      if (isThrottle(e)) coolUntil = Math.max(coolUntil, Date.now() + 10_000 * attempt); // everyone backs off together
      await sleep(800 * 2 ** attempt + Math.random() * 400);
    }
  }
}
const orNull = <T,>(p: Promise<T>) => p.catch((e) => { if (isNoData(e)) return null; throw e; });

export { num, pctOf };

const DAY = 864e5;

// EPS CAGR (%) over the available annual history (Yahoo gives ~4-5 fiscal years).
async function pastEpsGrowth(symbol: string) {
  const rows = await withRetry(() => yf.fundamentalsTimeSeries(symbol, { period1: new Date(Date.now() - 6 * 365 * DAY), type: "annual", module: "financials" }));
  return epsCagr(rows as { date: Date | string | number; dilutedEPS?: number }[]);
}

// Total returns (%) from adjusted closes: 7D from daily bars, the rest from 5 years of weekly bars.
async function returns(symbol: string) {
  const now = Date.now();
  const [d, w] = await Promise.all([
    withRetry(() => yf.chart(symbol, { period1: new Date(now - 14 * DAY), interval: "1d" })),
    withRetry(() => yf.chart(symbol, { period1: new Date(now - 5 * 365.25 * DAY - 7 * DAY), interval: "1wk" })),
  ]);
  return computeReturns(d.quotes, w.quotes, now);
}

/** Full details + scores for one symbol. Pass peer stats to include the industry-relative checks. */
export async function fetchDetail(symbol: string, peers?: PeerStats) {
  const noReturns = { ret_7d: null, ret_5y: null, ret_1m: null, ret_3m: null, ret_6m: null, ret_ytd: null };
  // the main call is required (throws = stock fails and is retried later); the others may legitimately be empty
  const [s, past5, rets] = await Promise.all([
    withRetry(() => yf.quoteSummary(symbol, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "earningsTrend"],
    })),
    orNull(pastEpsGrowth(symbol)),
    orNull(returns(symbol)).then((r) => r ?? noReturns),
  ]);
  const est = estimateFrom(s.earningsTrend?.trend);
  const price = s.price, sd = s.summaryDetail, ks = s.defaultKeyStatistics, fd = s.financialData, ap = s.assetProfile;
  await loadFx([price?.currency]);
  const fx = capToUsd(price?.currency);
  const mcap = num(price?.marketCap);
  const px = num(price?.regularMarketPrice);
  const high = num(sd?.fiftyTwoWeekHigh);
  // FCF and market cap must be in the same currency (ADRs often report in another one)
  const fcf = fd?.financialCurrency && fd.financialCurrency === price?.currency ? num(fd?.freeCashflow) : null;
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
    ret_1m: rets.ret_1m,
    ret_3m: rets.ret_3m,
    ret_6m: rets.ret_6m,
    ret_ytd: rets.ret_ytd,
    region: regionOf(ap?.country),
    market_cap_usd: mcap != null && fx != null ? Math.round(mcap * fx) : null,
    forward_pe: num(sd?.forwardPE ?? ks?.forwardPE),
    ps: num(sd?.priceToSalesTrailing12Months),
    ev_ebitda: num(ks?.enterpriseToEbitda),
    fcf_yield: fcf != null && mcap ? +((fcf / mcap) * 100).toFixed(2) : null,
    revenue_growth: pctOf(fd?.revenueGrowth),
    gross_margin: fd?.grossMargins ? pctOf(fd.grossMargins) : null, // banks/insurers report exactly 0 (no COGS): not applicable
    operating_margin: pctOf(fd?.operatingMargins),
    current_ratio: num(fd?.currentRatio),
    payout_ratio: pctOf(sd?.payoutRatio),
    insider_pct: pctOf(ks?.heldPercentInsiders),
    institution_pct: pctOf(ks?.heldPercentInstitutions),
    short_pct: pctOf(ks?.shortPercentOfFloat),
    avg_volume: num(sd?.averageVolume),
    employees: num(ap?.fullTimeEmployees),
    pct_from_high: px != null && high ? +((px / high - 1) * 100).toFixed(2) : null,
    is_primary_listing: true,
    has_details: true,
    detail_failures: 0,
    details_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...row, ...scoreAll(row as never, peers) };
}

