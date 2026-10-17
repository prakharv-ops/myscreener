"use client";
import { useEffect, useState } from "react";
import { MAX_AXIS, MAX_TOTAL, METRIC_GROUPS, METRICS, SNOWFLAKE_AXES } from "@/lib/metrics";
import { fmtMetric, fmtNum } from "@/lib/format";
import type { LivePrice } from "@/lib/use-live";
import type { StockRow } from "@/lib/screen";
import { PriceChart } from "./PriceChart";
import { ScoreBreakdown } from "./ScoreBreakdown";

const N = SNOWFLAKE_AXES.length, C = 110, R = 80;
const pt = (i: number, v: number) => {
  const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
  return [C + Math.cos(a) * (v / MAX_AXIS) * R, C + Math.sin(a) * (v / MAX_AXIS) * R] as const;
};

function BigSnowflake({ row }: { row: StockRow }) {
  const vals = SNOWFLAKE_AXES.map((a) => (row as unknown as Record<string, number | null>)[a.col] ?? 0);
  const avg = vals.reduce((a, b) => a + b, 0) / N;
  const color = avg >= 6 ? "#34d399" : avg >= 4 ? "#f5b942" : "#f87171";
  return (
    <svg viewBox="-30 0 280 220" className="mx-auto w-72">
      {[2.5, 5, 7.5, 10].map((l) => (
        <polygon key={l} points={SNOWFLAKE_AXES.map((_, i) => pt(i, l).join(",")).join(" ")} fill="none" stroke="currentColor" strokeOpacity={0.12} />
      ))}
      <polygon points={vals.map((v, i) => pt(i, v).join(",")).join(" ")} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} strokeLinejoin="round" className="fade-in" />
      {SNOWFLAKE_AXES.map((a, i) => {
        const [x, y] = pt(i, 12.3);
        return (
          <text key={a.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-400 text-[8.5px] uppercase">
            {a.label} <tspan className="fill-zinc-200">{vals[i].toFixed(1)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export function StockDrawer({ symbol, live, onClose }: { symbol: string | null; live: Record<string, LivePrice>; onClose: () => void }) {
  const [row, setRow] = useState<(StockRow & { description?: string | null; updated_at?: string }) | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    const ctl = new AbortController();
    fetch(`/api/stock/${encodeURIComponent(symbol)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => { setRow(j.error ? null : j); setLoadedFor(symbol); })
      .catch(() => {});
    return () => ctl.abort();
  }, [symbol]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!symbol) return null;
  const ready = loadedFor === symbol && row;
  const lp = live[symbol];

  return (
    <>
      <div className="fade-in fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-5">
          {ready ? (
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">{row.symbol} · {row.exchange} · {row.country}</div>
              <h2 className="mt-0.5 text-lg font-semibold leading-tight text-zinc-50">{row.name}</h2>
              <div className="mt-1 text-xs text-zinc-400">{[row.sector, row.industry].filter(Boolean).join(" · ") || "Sector not available yet"}</div>
            </div>
          ) : (
            <div className="space-y-2"><div className="skeleton h-3 w-32" /><div className="skeleton h-5 w-56" /><div className="skeleton h-3 w-40" /></div>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 5.3a1 1 0 0 0-1.4 1.4L8.6 10l-3.7 3.3a1 1 0 1 0 1.4 1.4L10 11.4l3.3 3.3a1 1 0 0 0 1.4-1.4L11.4 10l3.3-3.3a1 1 0 0 0-1.4-1.4L10 8.6 6.3 5.3Z" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {ready ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-zinc-50">
                    <span className="mr-1 text-sm text-zinc-500">{row.currency}</span>{fmtNum(lp?.price ?? row.price, 2)}
                  </div>
                  <div className="text-xs text-zinc-500">{lp ? "live" : "last close"} · market cap {fmtMetric("market_cap_usd", row.market_cap_usd)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">{row.score_total?.toFixed(1) ?? "–"}<span className="text-sm text-zinc-500">/{MAX_TOTAL}</span></div>
                  <div className="text-xs text-zinc-500">Snowflake score</div>
                </div>
              </div>

              <PriceChart key={`chart-${row.symbol}`} symbol={row.symbol} />

              {row.has_details ? <BigSnowflake row={row} /> : (
                <div className="rounded-lg border border-white/10 p-3 text-xs text-zinc-400">Full analysis for this stock hasn&apos;t run yet; it fills in during the nightly refresh.</div>
              )}

              {row.has_details && <ScoreBreakdown key={`why-${row.symbol}`} row={row} />}

              {row.description && <p className="line-clamp-6 text-sm leading-relaxed text-zinc-400">{row.description}</p>}

              {METRIC_GROUPS.map((g) => (
                <div key={g}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g}</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {METRICS.filter((m) => m.group === g).map((m) => (
                      <div key={m.key} className="flex justify-between gap-2 border-b border-white/[0.04] py-1">
                        <dt className="truncate text-zinc-500">{m.label.replace(/ \((%|% of float)\)$/, "")}</dt>
                        <dd className="tabular-nums text-zinc-200">{fmtMetric(m.key, (row as unknown as Record<string, number | null>)[m.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {row.updated_at && <div className="text-[11px] text-zinc-600">Data updated {new Date(row.updated_at).toLocaleString()}</div>}
            </>
          ) : (
            <div className="space-y-3">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-4 w-full" />)}</div>
          )}
        </div>
      </aside>
    </>
  );
}
