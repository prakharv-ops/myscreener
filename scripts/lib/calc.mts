// Pure calculations on Yahoo data (unit-tested). No network access here.

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const pctOf = (v: unknown) => (num(v) == null ? null : +((v as number) * 100).toFixed(2));
const DAY = 864e5;

// Next-year earnings growth estimate (%), falling back to current-year (earningsTrend module).
export function estimateFrom(t: { period?: string; growth?: number | null; earningsEstimate?: { avg?: number | null; yearAgoEps?: number | null } }[] | undefined) {
  const pick = (period: string) => {
    const x = t?.find((r) => r.period === period);
    if (!x) return null;
    if (num(x.growth) != null) return x.growth!;
    // some markets (e.g. Japan) have analyst EPS estimates but no precomputed growth: derive it
    const avg = num(x.earningsEstimate?.avg), prev = num(x.earningsEstimate?.yearAgoEps);
    return avg != null && prev != null && prev > 0 ? avg / prev - 1 : null;
  };
  return pctOf(pick("+1y") ?? pick("0y"));
}

/** EPS CAGR (%) between the first and last annual diluted EPS; null if < 1.5 years apart or either end isn't positive. */
export function epsCagr(rows: { date: Date | string | number; dilutedEPS?: number }[]) {
  const pts = rows.filter((r) => num(r.dilutedEPS) != null).sort((x, y) => +new Date(x.date) - +new Date(y.date));
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const years = (+new Date(b.date) - +new Date(a.date)) / (365.25 * DAY);
  if (!Number.isFinite(years) || years < 1.5 || a.dilutedEPS! <= 0 || b.dilutedEPS! <= 0) return null;
  return +((Math.pow(b.dilutedEPS! / a.dilutedEPS!, 1 / years) - 1) * 100).toFixed(2);
}

type Bar = { date: Date; adjclose?: number | null; close?: number | null };
/** Returns (%) from daily bars (7D) and ~5 years of weekly bars (1M/3M/6M/YTD/5Y). */
export function computeReturns(daily: Bar[], weekly: Bar[], now: number) {
  const ret = (from: number, to: number) => (from > 0 ? +(((to / from) - 1) * 100).toFixed(2) : null);
  const px = (q: Bar) => q.adjclose ?? q.close ?? null;
  const dq = daily.filter((q) => px(q) != null);
  const last = dq.at(-1);
  const base = [...dq].reverse().find((q) => last && +q.date <= +last.date - 7 * DAY);
  const ret_7d = last && base ? ret(px(base)!, px(last)!) : null;
  const wq = weekly.filter((q) => px(q) != null);
  const first = wq[0], wl = wq.at(-1);
  // require ~5 years of history, otherwise leave null
  const ret_5y = first && wl && +wl.date - +first.date > 4.8 * 365.25 * DAY ? ret(px(first)!, px(wl)!) : null;
  // shorter windows from the same weekly series: last close vs the last bar on/before the cut-off
  const since = (cut: number) => {
    const b = [...wq].reverse().find((q) => +q.date <= cut);
    return b && wl && +wl.date - +b.date > 0 ? ret(px(b)!, px(wl)!) : null;
  };
  const jan1 = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return { ret_7d, ret_5y, ret_1m: since(now - 30 * DAY), ret_3m: since(now - 91 * DAY), ret_6m: since(now - 182 * DAY), ret_ytd: since(jan1) };
}

// Minor currency units: Yahoo quotes some prices in pence/cents but market caps in the major unit.
export const MINOR: Record<string, [string, number]> = { GBp: ["GBP", 0.01], GBX: ["GBP", 0.01], ZAc: ["ZAR", 0.01], ILA: ["ILS", 0.01] };
/** [major currency, multiplier for prices], e.g. GBp -> ["GBP", 0.01]. */
export const majorOf = (c: string): [string, number] => MINOR[c] ?? [c, 1];
