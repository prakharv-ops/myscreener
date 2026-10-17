"use client";
import { MAX_TOTAL, SNOWFLAKE_AXES } from "@/lib/metrics";
import { fmtMetric, fmtNum } from "@/lib/format";
import type { LivePrice } from "@/lib/use-live";
import type { StockRow } from "@/lib/screen";
import { MiniSnowflake } from "./MiniSnowflake";

// The company / price / score columns are fixed; the middle ones change per view.
export const VIEWS: { label: string; cols: string[] }[] = [
  { label: "Overview", cols: ["ret_7d", "ret_1y", "market_cap_usd", "pe", "revenue_growth", "div_yield"] },
  { label: "Valuation", cols: ["pe", "forward_pe", "peg", "pb", "ps", "ev_ebitda", "fcf_yield"] },
  { label: "Growth", cols: ["revenue_growth", "earnings_growth_est_1y", "earnings_growth_past_1y", "earnings_growth_past_5y", "eps"] },
  { label: "Profitability", cols: ["roe", "roa", "gross_margin", "operating_margin", "profit_margin"] },
  { label: "Health & dividends", cols: ["debt_to_equity", "current_ratio", "beta", "div_yield", "payout_ratio"] },
  { label: "Performance", cols: ["ret_7d", "ret_1m", "ret_3m", "ret_ytd", "ret_1y", "ret_5y", "pct_from_high"] },
  { label: "Ownership", cols: ["analyst_count", "analyst_rating", "insider_pct", "institution_pct", "short_pct", "avg_volume"] },
  { label: "Snowflake", cols: SNOWFLAKE_AXES.map((a) => a.col) },
];

export const SHORT: Record<string, string> = {
  ret_7d: "7D", ret_1m: "1M", ret_3m: "3M", ret_ytd: "YTD", ret_1y: "1Y", ret_5y: "5Y", pct_from_high: "vs 52W high",
  market_cap_usd: "Mkt cap", pe: "PE", forward_pe: "Fwd PE", peg: "PEG", pb: "P/B", ps: "P/S", ev_ebitda: "EV/EBITDA", fcf_yield: "FCF yield",
  revenue_growth: "Rev growth", earnings_growth_est_1y: "EPS est.", earnings_growth_past_1y: "EPS 1Y", earnings_growth_past_5y: "EPS 5Y", eps: "EPS",
  roe: "ROE", roa: "ROA", gross_margin: "Gross m.", operating_margin: "Op. m.", profit_margin: "Net m.",
  debt_to_equity: "D/E", current_ratio: "Current", beta: "Beta", div_yield: "Div yield", payout_ratio: "Payout",
  analyst_count: "Analysts", analyst_rating: "Rating", insider_pct: "Insiders", institution_pct: "Institutions", short_pct: "Short", avg_volume: "Avg vol",
  ...Object.fromEntries(SNOWFLAKE_AXES.map((a) => [a.col, a.label])),
};
const SIGNED = new Set(["ret_7d", "ret_1m", "ret_3m", "ret_ytd", "ret_1y", "ret_5y", "pct_from_high", "revenue_growth", "earnings_growth_est_1y", "earnings_growth_past_1y", "earnings_growth_past_5y"]);

function Cell({ k, v }: { k: string; v: number | null | undefined }) {
  if (v == null) return <span className="text-zinc-600">–</span>;
  if (k.startsWith("score_")) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1 w-8 overflow-hidden rounded-full bg-white/10">
          <span className={`block h-full rounded-full ${v >= 7 ? "bg-emerald-400" : v >= 4 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${v * 10}%` }} />
        </span>
        {v.toFixed(1)}
      </span>
    );
  }
  const text = fmtMetric(k, v);
  return SIGNED.has(k) ? <span className={v < 0 ? "text-red-400" : "text-emerald-400"}>{text}</span> : <>{text}</>;
}

type Sort = { key: string; dir: "asc" | "desc" };

function Th({ k, sort, onSort, children, left }: { k: string; sort: Sort; onSort: (k: string) => void; children: React.ReactNode; left?: boolean }) {
  const on = sort.key === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-zinc-950/95 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider backdrop-blur transition-colors ${left ? "text-left" : "text-right"} ${on ? "text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}
    >
      {children}
      <span className={`ml-1 inline-block transition-transform ${on ? "opacity-100" : "opacity-0"} ${on && sort.dir === "asc" ? "rotate-180" : ""}`}>↓</span>
    </th>
  );
}

export function ResultsTable({
  rows,
  view,
  sort,
  onSort,
  live,
  loading,
  firstLoad,
  selected,
  onSelect,
}: {
  rows: StockRow[];
  view: number;
  sort: Sort;
  onSort: (k: string) => void;
  live: Record<string, LivePrice>;
  loading: boolean;
  firstLoad: boolean;
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const cols = VIEWS[view].cols;
  return (
    <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.01]">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <Th k="name" sort={sort} onSort={onSort} left>Company</Th>
            <Th k="price" sort={sort} onSort={onSort}>Price</Th>
            {cols.map((c) => <Th key={c} k={c} sort={sort} onSort={onSort}>{SHORT[c] ?? c}</Th>)}
            <Th k="score_total" sort={sort} onSort={onSort}>Score</Th>
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-200 ${loading && !firstLoad ? "opacity-50" : "opacity-100"}`}>
          {firstLoad
            ? Array.from({ length: 12 }, (_, i) => (
                <tr key={i}>
                  <td className="border-b border-white/[0.04] px-3 py-3"><div className="flex items-center gap-3"><div className="skeleton h-10 w-10 rounded-full" /><div className="space-y-1.5"><div className="skeleton h-3.5 w-40" /><div className="skeleton h-3 w-56" /></div></div></td>
                  {Array.from({ length: cols.length + 2 }, (_, j) => <td key={j} className="border-b border-white/[0.04] px-3"><div className="skeleton ml-auto h-3.5 w-12" /></td>)}
                </tr>
              ))
            : rows.map((r) => {
                const lp = live[r.symbol];
                return (
                  <tr
                    key={r.symbol}
                    onClick={() => onSelect(r.symbol)}
                    className={`group cursor-pointer transition-colors ${selected === r.symbol ? "bg-amber-400/[0.07]" : "hover:bg-white/[0.035]"}`}
                  >
                    <td className="border-b border-white/[0.04] px-3 py-2">
                      <div className="flex items-center gap-3">
                        <MiniSnowflake row={r} />
                        <div className="min-w-0 max-w-[260px] xl:max-w-[340px]">
                          <div className="truncate font-medium text-zinc-100 group-hover:text-white">{r.name}</div>
                          <div className="truncate text-xs text-zinc-500">
                            <span className="text-zinc-400">{r.symbol}</span> · {r.country ?? "–"}{r.industry ? ` · ${r.industry}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-white/[0.04] px-3 py-2 text-right tabular-nums">
                      <span className="mr-1 text-[11px] text-zinc-500">{r.currency}</span>
                      <span key={lp?.at} className={`rounded px-1 ${lp?.dir === 1 ? "flash-up" : lp?.dir === -1 ? "flash-down" : ""}`}>{fmtNum(lp?.price ?? r.price, 2)}</span>
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="whitespace-nowrap border-b border-white/[0.04] px-3 py-2 text-right tabular-nums text-zinc-300">
                        <Cell k={c} v={(r as unknown as Record<string, number | null>)[c]} />
                      </td>
                    ))}
                    <td className="whitespace-nowrap border-b border-white/[0.04] px-3 py-2 text-right tabular-nums">
                      {r.score_total == null ? <span className="text-zinc-600">–</span> : (
                        <span className="text-zinc-200">{r.score_total.toFixed(1)}<span className="text-zinc-500">/{MAX_TOTAL}</span></span>
                      )}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!firstLoad && !rows.length && (
        <div className="fade-in flex flex-col items-center justify-center gap-1 py-20 text-center text-sm text-zinc-500">
          <div className="text-zinc-300">No stocks match these filters</div>
          <div>Try loosening a filter or removing one of the pills above.</div>
        </div>
      )}
    </div>
  );
}
