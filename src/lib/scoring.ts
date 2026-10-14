import type { StockRow } from "./screen";

type M = Partial<StockRow>;
const n = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

// Each axis: count of passed checks, scaled to 0–6. Transparent rules — tune freely.
const scale = (passed: number, total: number) => Math.round((passed / total) * 6);

export function scoreValue(m: M) {
  const checks = [
    n(m.pe) && m.pe > 0 && m.pe < 20,
    n(m.pb) && m.pb > 0 && m.pb < 3,
    n(m.peg) && m.peg > 0 && m.peg < 1.5,
    n(m.price) && n(m.analyst_target) && m.price < m.analyst_target * 0.85,
    n(m.eps) && m.eps > 0,
    n(m.pe) && m.pe > 0 && m.pe < 12,
  ];
  return scale(checks.filter(Boolean).length, checks.length);
}

export function scoreFuture(m: M) {
  const checks = [
    n(m.earnings_growth_est_1y) && m.earnings_growth_est_1y > 5,
    n(m.earnings_growth_est_1y) && m.earnings_growth_est_1y > 15,
    n(m.earnings_growth_est_1y) && m.earnings_growth_est_1y > 25,
    n(m.roe) && m.roe > 15,
    n(m.analyst_count) && m.analyst_count >= 5,
    n(m.price) && n(m.analyst_target) && m.analyst_target > m.price * 1.1,
  ];
  return scale(checks.filter(Boolean).length, checks.length);
}

export function scorePast(m: M) {
  const checks = [
    n(m.earnings_growth_past_1y) && m.earnings_growth_past_1y > 0,
    n(m.earnings_growth_past_1y) && m.earnings_growth_past_1y > 15,
    n(m.earnings_growth_past_5y) && m.earnings_growth_past_5y > 0,
    n(m.earnings_growth_past_5y) && m.earnings_growth_past_5y > 10,
    n(m.roe) && m.roe > 10,
    n(m.roa) && m.roa > 5,
  ];
  return scale(checks.filter(Boolean).length, checks.length);
}

export function scoreHealth(m: M) {
  const checks = [
    n(m.debt_to_equity) && m.debt_to_equity < 100,
    n(m.debt_to_equity) && m.debt_to_equity < 50,
    n(m.roa) && m.roa > 3,
    n(m.eps) && m.eps > 0,
    n(m.beta) && m.beta < 1.3,
    n(m.market_cap) && m.market_cap > 2e9,
  ];
  return scale(checks.filter(Boolean).length, checks.length);
}

export function scoreDividends(m: M) {
  const y = m.div_yield;
  const checks = [
    n(y) && y > 0,
    n(y) && y > 1.5,
    n(y) && y > 3,
    n(y) && y > 5,
    n(y) && n(m.eps) && m.eps > 0,
    n(y) && y < 12, // very high yields are usually a trap
  ];
  return scale(checks.filter(Boolean).length, checks.length);
}

export function scoreAll(m: M) {
  const s = {
    score_value: scoreValue(m),
    score_future: scoreFuture(m),
    score_past: scorePast(m),
    score_health: scoreHealth(m),
    score_dividends: scoreDividends(m),
  };
  return { ...s, score_total: Object.values(s).reduce((a, b) => a + b, 0) };
}
