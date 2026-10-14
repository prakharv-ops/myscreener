import type { StockRow } from "./screen";

type M = Partial<StockRow>;
const n = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Map v linearly so `bad` -> 0 and `good` -> 1 (works for both directions), clamped. */
const lin = (v: number | null | undefined, bad: number, good: number) =>
  n(v) ? Math.max(0, Math.min(1, (v - bad) / (good - bad))) : null;

/** Average of the sub-scores that exist (0..1). Missing data is ignored rather than punished; no data at all -> 0. */
const blend = (parts: (number | null)[]) => {
  const have = parts.filter((p): p is number => p !== null);
  return have.length ? have.reduce((a, b) => a + b, 0) / have.length : 0;
};
const to10 = (x: number) => Math.round(x * 100) / 10; // 0..10, one decimal

const upside = (m: M) => (n(m.price) && n(m.analyst_target) && m.price > 0 ? (m.analyst_target / m.price - 1) * 100 : null);

// Every axis is a smooth 0–10 blend, so stocks spread out instead of clumping on a few integer levels.

export const scoreValue = (m: M) =>
  to10(blend([
    n(m.pe) && m.pe > 0 ? lin(m.pe, 45, 8) : n(m.pe) ? 0 : null, // negative PE = loss-making
    n(m.pb) && m.pb > 0 ? lin(m.pb, 8, 1) : null,
    n(m.peg) && m.peg > 0 ? lin(m.peg, 3, 0.8) : null,
    lin(upside(m), -10, 40),
  ]));

export const scoreFuture = (m: M) =>
  to10(blend([
    lin(m.earnings_growth_est_1y, -5, 30),
    lin(m.earnings_growth_est_1y, 5, 20), // extra weight for solid growth
    lin(upside(m), 0, 30),
    lin(m.roe, 5, 30),
  ]));

export const scorePast = (m: M) =>
  to10(blend([
    lin(m.earnings_growth_past_1y, -10, 40),
    lin(m.earnings_growth_past_5y, -5, 25),
    lin(m.roe, 5, 25),
    lin(m.roa, 1, 12),
  ]));

export const scoreHealth = (m: M) =>
  to10(blend([
    lin(m.debt_to_equity, 200, 20),
    lin(m.roa, 0, 10),
    n(m.market_cap) && m.market_cap > 0 ? lin(Math.log10(m.market_cap), 8.7, 11.3) : null, // ~$0.5b -> $200b
    n(m.eps) ? (m.eps > 0 ? 1 : 0) : null,
    lin(m.beta, 2, 0.6),
  ]));

export const scoreDividends = (m: M) => {
  const y = m.div_yield;
  if (!n(y) || y <= 0) return 0;
  const trap = y > 10 ? 0.4 : 1; // implausibly high yields are usually a warning sign
  return to10(blend([lin(y, 0, 4.5), n(m.eps) ? (m.eps > 0 ? 1 : 0) : null, lin(m.debt_to_equity, 200, 20)]) * trap);
};

export const scoreMomentum = (m: M) =>
  to10(blend([lin(m.ret_7d, -6, 6), lin(m.ret_1y, -25, 60), lin(m.ret_5y, -20, 250)]));

export const scoreQuality = (m: M) =>
  to10(blend([lin(m.roe, 4, 30), lin(m.roa, 1, 12), lin(m.profit_margin, 2, 30)]));

export const scoreSentiment = (m: M) =>
  to10(blend([
    lin(upside(m), -5, 35),
    lin(m.analyst_rating, 3.8, 1.6), // Yahoo: 1 = strong buy ... 5 = sell
    n(m.analyst_count) ? lin(Math.log10(1 + m.analyst_count), 0.3, 1.5) : null, // wider coverage = more trust
  ]));

export function scoreAll(m: M) {
  const s = {
    score_value: scoreValue(m),
    score_future: scoreFuture(m),
    score_past: scorePast(m),
    score_health: scoreHealth(m),
    score_dividends: scoreDividends(m),
    score_momentum: scoreMomentum(m),
    score_quality: scoreQuality(m),
    score_sentiment: scoreSentiment(m),
  };
  return { ...s, score_total: Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 10) / 10 };
}
