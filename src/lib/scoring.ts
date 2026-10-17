import type { StockRow } from "./screen";

// Snowflake scoring. Every axis is a list of named checks; each check maps one metric onto 0..1
// (bad -> 0, good -> 1, linear in between, clamped). An axis score is the average of the checks that have
// data, scaled to 0–10 with one decimal. Missing data is ignored rather than punished; no data at all -> 0.
// `explainAll` returns the same checks the scores are computed from, so the "why" can never drift from the score.

type M = Partial<StockRow>;
const n = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Map v linearly so `bad` -> 0 and `good` -> 1 (works for both directions), clamped. */
export const lin = (v: number | null | undefined, bad: number, good: number) =>
  n(v) ? Math.max(0, Math.min(1, (v - bad) / (good - bad))) : null;

const to10 = (x: number) => Math.round(x * 100) / 10; // 0..10, one decimal

export interface Check {
  label: string;
  /** the metric value the check looked at (null = no data, check skipped) */
  value: number | null;
  /** how the value is shown: "pct" (12.3%), "x" (multiple), "num", "usd" (market cap) or "yesno" */
  unit: "pct" | "x" | "num" | "usd" | "yesno";
  /** 0..1 contribution, null when there's no data */
  score: number | null;
  /** plain-English rule, e.g. "full marks at ≤ 8×, none at ≥ 45×" */
  rule: string;
}

export type AxisKey = "value" | "future" | "past" | "health" | "dividends" | "momentum" | "quality" | "sentiment";

export interface AxisExplanation {
  axis: AxisKey;
  score: number;
  checks: Check[];
  note?: string;
}

const upside = (m: M) => (n(m.price) && n(m.analyst_target) && m.price > 0 ? (m.analyst_target / m.price - 1) * 100 : null);

const unitStr = (u: Check["unit"], v: number) => (u === "pct" ? `${v}%` : u === "x" ? `${v}×` : `${v}`);
/** Standard linear check with an auto-generated rule. */
function lc(label: string, value: number | null | undefined, bad: number, good: number, unit: Check["unit"] = "num"): Check {
  const better = good > bad ? "≥" : "≤", worse = good > bad ? "≤" : "≥";
  return { label, value: n(value) ? value : null, unit, score: lin(value, bad, good), rule: `full marks at ${better} ${unitStr(unit, good)}, none at ${worse} ${unitStr(unit, bad)}` };
}
/** Same, but only scored for positive values (a ratio of losses isn't "cheap"); non-positive values are shown but skipped. */
function lcPos(label: string, value: number | null | undefined, bad: number, good: number, unit: Check["unit"] = "x"): Check {
  const c = lc(label, value, bad, good, unit);
  return n(value) && value > 0 ? c : { ...c, score: null, rule: `${c.rule} (skipped when not positive)` };
}
const yes = (label: string, ok: boolean | null, rule: string): Check => ({ label, value: ok == null ? null : ok ? 1 : 0, unit: "yesno", score: ok == null ? null : ok ? 1 : 0, rule });

const AXES: Record<AxisKey, (m: M) => Check[]> = {
  value: (m) => [
    // a negative PE means the company is loss-making: scored 0 rather than skipped
    n(m.pe) && m.pe <= 0 ? { label: "PE ratio", value: m.pe, unit: "x", score: 0, rule: "loss-making (negative earnings) scores 0" } : lc("PE ratio", m.pe, 45, 8, "x"),
    lcPos("Price / book", m.pb, 8, 1),
    lcPos("PEG ratio", m.peg, 3, 0.8),
    lc("Upside to analyst target", upside(m), -10, 40, "pct"),
    lcPos("Forward PE", m.forward_pe, 40, 8),
    lcPos("Price / sales", m.ps, 12, 0.8),
    lcPos("EV / EBITDA", m.ev_ebitda, 30, 6),
    lc("Free cash flow yield", m.fcf_yield, 0, 8, "pct"),
  ],
  future: (m) => [
    lc("Forecast EPS growth", m.earnings_growth_est_1y, -5, 30, "pct"),
    lc("Forecast EPS growth (solid-growth bonus)", m.earnings_growth_est_1y, 5, 20, "pct"),
    lc("Upside to analyst target", upside(m), 0, 30, "pct"),
    lc("Return on equity", m.roe, 5, 30, "pct"),
    lc("Revenue growth", m.revenue_growth, -5, 25, "pct"),
  ],
  past: (m) => [
    lc("EPS growth, last year", m.earnings_growth_past_1y, -10, 40, "pct"),
    lc("EPS growth, ~5 yr p.a.", m.earnings_growth_past_5y, -5, 25, "pct"),
    lc("Return on equity", m.roe, 5, 25, "pct"),
    lc("Return on assets", m.roa, 1, 12, "pct"),
  ],
  health: (m) => [
    lc("Debt / equity", m.debt_to_equity, 200, 20, "pct"),
    lc("Return on assets", m.roa, 0, 10, "pct"),
    {
      label: "Size (market cap)",
      value: n(m.market_cap) && m.market_cap > 0 ? (m.market_cap_usd ?? m.market_cap) : null,
      unit: "usd",
      score: n(m.market_cap) && m.market_cap > 0 ? lin(Math.log10(m.market_cap), 8.7, 11.3) : null,
      rule: "full marks at ≥ ~200b, none at ≤ ~500m (log scale, local currency)",
    },
    yes("Profitable (EPS > 0)", n(m.eps) ? m.eps > 0 : null, "yes = full marks, no = none"),
    lc("Beta (volatility)", m.beta, 2, 0.6, "num"),
    lc("Current ratio", m.current_ratio, 0.7, 2, "x"),
  ],
  dividends: (m) => [
    lc("Dividend yield", n(m.div_yield) && m.div_yield > 0 ? m.div_yield : null, 0, 4.5, "pct"),
    yes("Profitable (EPS > 0)", n(m.eps) ? m.eps > 0 : null, "dividends should be paid from profits"),
    lc("Debt / equity", m.debt_to_equity, 200, 20, "pct"),
    {
      // payout up to 75% is sustainable; above 100% means paying out more than it earns
      label: "Payout ratio",
      value: n(m.payout_ratio) ? m.payout_ratio : null,
      unit: "pct",
      score: n(m.payout_ratio) ? (m.payout_ratio <= 75 ? 1 : lin(m.payout_ratio, 120, 75)) : null,
      rule: "full marks at ≤ 75%, none at ≥ 120%",
    },
  ],
  momentum: (m) => [
    lc("7-day return", m.ret_7d, -6, 6, "pct"),
    lc("1-month return", m.ret_1m, -10, 12, "pct"),
    lc("3-month return", m.ret_3m, -15, 25, "pct"),
    lc("6-month return", m.ret_6m, -20, 40, "pct"),
    lc("1-year return", m.ret_1y, -25, 60, "pct"),
    lc("5-year return", m.ret_5y, -20, 250, "pct"),
    lc("Distance from 52-week high", m.pct_from_high, -40, -3, "pct"),
  ],
  quality: (m) => [
    lc("Return on equity", m.roe, 4, 30, "pct"),
    lc("Return on assets", m.roa, 1, 12, "pct"),
    lc("Net profit margin", m.profit_margin, 2, 30, "pct"),
    lc("Gross margin", m.gross_margin, 15, 65, "pct"),
    lc("Operating margin", m.operating_margin, 3, 35, "pct"),
  ],
  sentiment: (m) => [
    lc("Upside to analyst target", upside(m), -5, 35, "pct"),
    lc("Analyst rating (1 = strong buy)", m.analyst_rating, 3.8, 1.6, "num"),
    {
      label: "Analyst coverage",
      value: n(m.analyst_count) ? m.analyst_count : null,
      unit: "num",
      score: n(m.analyst_count) ? lin(Math.log10(1 + m.analyst_count), 0.3, 1.5) : null,
      rule: "full marks at ≥ ~30 analysts, none at ≤ 1 (log scale)",
    },
    lc("Short interest (% of float)", m.short_pct, 15, 1, "pct"),
    lc("Institutional ownership", m.institution_pct, 5, 70, "pct"),
  ],
};

export const AXIS_KEYS = Object.keys(AXES) as AxisKey[];

export function explainAxis(axis: AxisKey, m: M): AxisExplanation {
  const checks = AXES[axis](m);
  if (axis === "dividends" && !(n(m.div_yield) && m.div_yield > 0)) {
    return { axis, score: 0, checks, note: "Pays no dividend, so this axis scores 0." };
  }
  const have = checks.filter((c) => c.score !== null).map((c) => c.score!);
  let raw = have.length ? have.reduce((a, b) => a + b, 0) / have.length : 0;
  let note: string | undefined = have.length ? undefined : "No data for any of these checks yet.";
  if (axis === "dividends" && m.div_yield! > 10) {
    raw *= 0.4;
    note = "A yield above 10% is usually a warning sign (price collapse or unsustainable payout), so this score is cut by 60%.";
  }
  return { axis, score: to10(raw), checks, note };
}

export function explainAll(m: M): Record<AxisKey, AxisExplanation> {
  return Object.fromEntries(AXIS_KEYS.map((a) => [a, explainAxis(a, m)])) as Record<AxisKey, AxisExplanation>;
}

export const scoreValue = (m: M) => explainAxis("value", m).score;
export const scoreFuture = (m: M) => explainAxis("future", m).score;
export const scorePast = (m: M) => explainAxis("past", m).score;
export const scoreHealth = (m: M) => explainAxis("health", m).score;
export const scoreDividends = (m: M) => explainAxis("dividends", m).score;
export const scoreMomentum = (m: M) => explainAxis("momentum", m).score;
export const scoreQuality = (m: M) => explainAxis("quality", m).score;
export const scoreSentiment = (m: M) => explainAxis("sentiment", m).score;

export function scoreAll(m: M) {
  const e = explainAll(m);
  const s = {
    score_value: e.value.score,
    score_future: e.future.score,
    score_past: e.past.score,
    score_health: e.health.score,
    score_dividends: e.dividends.score,
    score_momentum: e.momentum.score,
    score_quality: e.quality.score,
    score_sentiment: e.sentiment.score,
  };
  return { ...s, score_total: Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 10) / 10 };
}
