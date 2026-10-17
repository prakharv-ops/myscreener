"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum } from "@/lib/format";

// Single-series price chart: 2px line + faint area, recessive axes, crosshair + tooltip that snaps to the
// nearest bar (pointer and arrow keys). Series colour validated against the dark surface (dataviz validator).
const SERIES = "#3987e5";
const H = 180, PAD = { t: 10, r: 52, b: 22, l: 4 };
const RANGES = [["1m", "1M"], ["6m", "6M"], ["1y", "1Y"], ["5y", "5Y"]] as const;
type Range = (typeof RANGES)[number][0];
interface Pt { t: number; c: number }

const niceTicks = (min: number, max: number, count = 4) => {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
};
const fmtDate = (t: number, range: Range) =>
  new Date(t).toLocaleDateString(undefined, range === "5y" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: range === "1m" ? undefined : "2-digit" });

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>("1y");
  const [data, setData] = useState<{ key: string; currency: string | null; points: Pt[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(400);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const key = `${symbol}|${range}`;
  const loading = data?.key !== key;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/stock/${encodeURIComponent(symbol)}/history?range=${range}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.error || !j.points?.length) { setError("No price history available."); return; }
        setError(null);
        setData({ key, currency: j.currency, points: j.points });
        setHover(null);
      })
      .catch((e) => { if (e.name !== "AbortError") setError("Couldn't load price history."); });
    return () => ctl.abort();
  }, [symbol, range, key]);

  const pts = useMemo(() => data?.points ?? [], [data]);
  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const cs = pts.map((p) => p.c);
    const lo = Math.min(...cs), hi = Math.max(...cs), pad = (hi - lo) * 0.08 || hi * 0.02;
    const yMin = lo - pad, yMax = hi + pad;
    const t0 = pts[0].t, t1 = pts.at(-1)!.t;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (width - PAD.l - PAD.r);
    const y = (c: number) => PAD.t + (1 - (c - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.c).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${H - PAD.b}L${x(t0).toFixed(1)},${H - PAD.b}Z`;
    return { x, y, line, area, ticks: niceTicks(yMin, yMax), lo, hi };
  }, [pts, width]);

  const first = pts[0]?.c, last = pts.at(-1)?.c;
  const change = first && last ? (last / first - 1) * 100 : null;
  const hp = hover != null ? pts[hover] : null;

  const nearest = (clientX: number) => {
    if (!geo || !box.current) return;
    const px = clientX - box.current.getBoundingClientRect().left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(geo.x(pts[i].t) - px); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-400">
          Price{data?.currency ? ` (${data.currency})` : ""}
          {change != null && !loading && (
            <span className={`ml-2 tabular-nums ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% over {RANGES.find((r) => r[0] === range)![1]}
            </span>
          )}
        </div>
        <div className="flex gap-0.5 rounded-md border border-white/[0.06] p-0.5" role="group" aria-label="Chart range">
          {RANGES.map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)} aria-pressed={range === k}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${range === k ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={box}
        className={`relative select-none outline-none transition-opacity duration-200 focus-visible:ring-1 focus-visible:ring-white/20 ${loading && data ? "opacity-50" : ""}`}
        style={{ height: H }}
        tabIndex={0}
        aria-label={change != null ? `Price chart, ${range}: ${fmtNum(first, 2)} to ${fmtNum(last, 2)}` : "Price chart"}
        onPointerMove={(e) => nearest(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (!pts.length) return;
          if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? pts.length) - 1)); }
          if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(pts.length - 1, (h ?? -1) + 1)); }
          if (e.key === "Escape") setHover(null);
        }}
      >
        {!data && !error && <div className="skeleton absolute inset-0" />}
        {error && !geo && <div className="flex h-full items-center justify-center text-xs text-zinc-500">{error}</div>}
        {geo && (
          <svg width={width} height={H} className="absolute inset-0 overflow-visible">
            <defs>
              <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* recessive grid + y labels on the right */}
            {geo.ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={width - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="currentColor" className="text-white/[0.06]" />
                <text x={width - PAD.r + 6} y={geo.y(v)} dominantBaseline="middle" className="fill-zinc-500 text-[10px] tabular-nums">{fmtNum(v, v < 10 ? 2 : 0)}</text>
              </g>
            ))}
            <path d={geo.area} fill="url(#pc-fill)" />
            <path d={geo.line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* x labels: first and last date only */}
            <text x={PAD.l} y={H - 6} className="fill-zinc-500 text-[10px]">{fmtDate(pts[0].t, range)}</text>
            <text x={width - PAD.r} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[10px]">{fmtDate(pts.at(-1)!.t, range)}</text>
            {hp && (
              <g pointerEvents="none">
                <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" className="text-zinc-400/50" />
                <circle cx={geo.x(hp.t)} cy={geo.y(hp.c)} r={4} fill={SERIES} stroke="#09090b" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hp && geo && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(geo.x(hp.t) - 50, 0), width - 110) }}
          >
            <div className="font-semibold tabular-nums text-zinc-50">{fmtNum(hp.c, 2)}</div>
            <div className="text-zinc-400">{new Date(hp.t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        )}
      </div>

      {/* text equivalent of the chart (screen readers, and anyone who prefers numbers) */}
      {geo && first != null && last != null && (
        <dl className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
          {[["Start", first], ["End", last], ["Low", geo.lo], ["High", geo.hi]].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-zinc-500">{k}</dt>
              <dd className="tabular-nums text-zinc-300">{fmtNum(v as number, 2)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
