import { metricByKey } from "./metrics";

export const fmtNum = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
export const fmtCap = (v: number | null | undefined) =>
  v == null ? "–" : v >= 1e12 ? `${(v / 1e12).toFixed(2)}t` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}b` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}m` : `${Math.round(v / 1e3)}k`;
export const pct = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}%`);

/** Plain-text value for any metric key (used in the detail panel and tooltips). */
export function fmtMetric(key: string, v: number | null | undefined): string {
  if (v == null) return "–";
  if (key === "market_cap_usd") return `$${fmtCap(v)}`;
  const m = metricByKey(key);
  if (m?.fmt === "usd" || key === "avg_volume" || key === "employees") return fmtCap(v);
  if (m?.fmt === "pct") return pct(v);
  return fmtNum(v, m?.fmt === "ratio" ? 2 : 1);
}
