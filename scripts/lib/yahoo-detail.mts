// Shared Yahoo "full details" fetch + scoring used by ingest.mts and enrich.mts.
import YahooFinance from "yahoo-finance2";
import { scoreAll } from "../../src/lib/scoring";

export const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const pctOf = (v: unknown) => (num(v) == null ? null : +((v as number) * 100).toFixed(2));

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

export async function fetchDetail(symbol: string) {
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
    has_details: true,
    detail_failures: 0,
    details_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...row, ...scoreAll(row as never) };
}

