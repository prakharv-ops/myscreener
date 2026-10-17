"use client";
import { useMemo, useState } from "react";
import { SNOWFLAKE_AXES } from "@/lib/metrics";
import { fmtCap, fmtNum } from "@/lib/format";
import { explainAll, type AxisKey, type Check } from "@/lib/scoring";
import type { StockRow } from "@/lib/screen";

const fmtValue = (c: Check) => {
  if (c.value == null) return "no data";
  switch (c.unit) {
    case "pct": return `${fmtNum(c.value, 1)}%`;
    case "x": return `${fmtNum(c.value, 1)}×`;
    case "usd": return fmtCap(c.value);
    case "yesno": return c.value ? "Yes" : "No";
    default: return fmtNum(c.value, 2);
  }
};
const tone = (s: number) => (s >= 7 ? "text-emerald-400" : s >= 4 ? "text-amber-300" : "text-red-400");
const barTone = (s: number) => (s >= 0.7 ? "bg-emerald-400" : s >= 0.4 ? "bg-amber-400" : "bg-red-400");

/** "Why this score?": every Snowflake axis with the checks it was computed from (same code as the scores). */
export function ScoreBreakdown({ row }: { row: StockRow }) {
  const ex = useMemo(() => explainAll(row), [row]);
  // open the weakest axis by default: that's usually the question ("why is Value so low?")
  const weakest = useMemo(() => SNOWFLAKE_AXES.map((a) => a.key as AxisKey).sort((a, b) => ex[a].score - ex[b].score)[0], [ex]);
  const [open, setOpen] = useState<AxisKey | null>(weakest);

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Why this score?</div>
      <div className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
        {SNOWFLAKE_AXES.map((a) => {
          const e = ex[a.key as AxisKey];
          const isOpen = open === a.key;
          const used = e.checks.filter((c) => c.score !== null).length;
          return (
            <div key={a.key}>
              <button
                onClick={() => setOpen(isOpen ? null : (a.key as AxisKey))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.03]"
              >
                <span className="w-24 text-zinc-300">{a.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className={`block h-full rounded-full transition-[width] duration-300 ${barTone(e.score / 10)}`} style={{ width: `${e.score * 10}%` }} />
                </span>
                <span className={`w-12 text-right tabular-nums ${tone(e.score)}`}>{e.score.toFixed(1)}</span>
                <svg className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
              </button>
              {isOpen && (
                <div className="fade-in space-y-1.5 px-3 pb-3">
                  <p className="text-[11px] text-zinc-500">
                    Average of {used} of {e.checks.length} checks with data, each scored 0–1, × 10.
                  </p>
                  {e.note && <p className="rounded-md bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">{e.note}</p>}
                  {e.checks.map((c, i) => (
                    <div key={i} className={`grid grid-cols-[1fr_auto_3rem] items-center gap-x-3 ${c.score === null ? "opacity-45" : ""}`}>
                      <div className="min-w-0">
                        <div className="truncate text-xs text-zinc-300">{c.label}</div>
                        <div className="truncate text-[10.5px] text-zinc-500">{c.score === null ? "skipped (no data)" : c.rule}</div>
                      </div>
                      <div className="text-right text-xs tabular-nums text-zinc-200">{fmtValue(c)}</div>
                      <div className="flex items-center justify-end gap-1.5" title={c.score === null ? "not counted" : `contributes ${(c.score * 10).toFixed(1)} / 10`}>
                        {c.score === null ? <span className="text-[10.5px] text-zinc-600">—</span> : (
                          <span className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.06]">
                            <span className={`block h-full rounded-full ${barTone(c.score)}`} style={{ width: `${Math.max(4, c.score * 100)}%` }} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
