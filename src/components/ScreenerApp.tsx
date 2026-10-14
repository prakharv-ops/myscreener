"use client";
import { useEffect, useState } from "react";
import { MAX_TOTAL, METRICS, SNOWFLAKE_AXES, metricByKey } from "@/lib/metrics";
import { useLive } from "@/lib/use-live";
import type { ScreenAlert } from "@/lib/alerts";
import type { SavedScreen } from "@/lib/saved";
import type { ScreenResult, StockRow } from "@/lib/screen";
import { MiniSnowflake } from "./MiniSnowflake";
import { SnowflakeFilter } from "./SnowflakeFilter";

const PAGE = 50;

interface MetricFilter { key: string; min?: number; max?: number }

const fmtNum = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const fmtCap = (v: number | null) =>
  v == null ? "–" : v >= 1e12 ? `${(v / 1e12).toFixed(1)}t` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}b` : `${(v / 1e6).toFixed(0)}m`;
const pct = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);

function Th({ k, sort, onSort, children }: { k: string; sort: { key: string; dir: "asc" | "desc" }; onSort: (k: string) => void; children: React.ReactNode }) {
  return (
    <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => onSort(k)}>
      {children}{sort.key === k ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}

function Multi({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="mb-2 text-xs font-semibold uppercase opacity-60">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-amber-400 bg-amber-400/20" : "border-white/15 opacity-70"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {!value.length && <div className="mt-2 text-xs opacity-50">All</div>}
    </div>
  );
}

export function ScreenerApp() {
  const [markets, setMarkets] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [snowflake, setSnowflake] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<MetricFilter[]>([]);
  const [keywords, setKeywords] = useState("");
  const [detailedOnly, setDetailedOnly] = useState(true);
  const [coverage, setCoverage] = useState<{ total: number; analysed: number } | null>(null);
  const [sort, setSort] = useState({ key: "market_cap", dir: "desc" as "asc" | "desc" });
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<ScreenResult | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [facets, setFacets] = useState<{ markets: string[]; industries: string[] }>({ markets: [], industries: [] });
  useEffect(() => {
    fetch("/api/facets").then((r) => r.json()).then((j) => {
      if (j.total) setCoverage({ total: j.total, analysed: j.analysed });
      if (j.markets) setFacets({ markets: j.markets.map((x: { name: string }) => x.name), industries: j.industries.map((x: { name: string }) => x.name) });
    }).catch(() => {});
  }, []);
  const [err, setErr] = useState<string | null>(null);
  const { prices: live, mode: liveMode } = useLive((res?.rows ?? []).map((r) => r.symbol));
  const [saved, setSaved] = useState<SavedScreen[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [alerts, setAlerts] = useState<ScreenAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadAlerts = () =>
    fetch("/api/alerts").then((r) => r.json()).then((j) => Array.isArray(j) && setAlerts(j)).catch(() => {});
  useEffect(() => { loadAlerts(); }, []);
  const unseen = alerts.filter((a) => !a.seen).length;
  const active = saved.find((x) => x.id === activeId);

  const toggleAlerts = async () => {
    if (!active) return;
    await fetch(`/api/screens/${active.id}`, { method: "PATCH", body: JSON.stringify({ alerts_enabled: !active.alerts_enabled }) });
    loadSaved();
  };
  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/alerts/run", { method: "POST" });
      if (!r.ok) setErr(`Alert check failed (${r.status})`);
    } finally {
      setChecking(false);
      loadAlerts();
      loadSaved();
    }
  };
  const markAllSeen = async () => {
    await fetch("/api/alerts", { method: "POST", body: "{}" });
    loadAlerts();
  };

  const loadSaved = () =>
    fetch("/api/screens").then((r) => r.json()).then((j) => Array.isArray(j) && setSaved(j)).catch(() => {});
  useEffect(() => { loadSaved(); }, []);

  const applySaved = (id: string) => {
    setActiveId(id);
    const s = saved.find((x) => x.id === id)?.spec;
    if (!s) return;
    setMarkets(s.markets); setIndustries(s.industries); setSnowflake(s.snowflake);
    setMetrics(s.metrics); setKeywords(s.keywords); setDetailedOnly(s.detailedOnly ?? true); setSort(s.sort); setPage(0);
  };
  const saveCurrent = async () => {
    const name = window.prompt("Name this screen");
    if (!name?.trim()) return;
    const r = await fetch("/api/screens", { method: "POST", body: JSON.stringify({ name, spec }) });
    const j = await r.json();
    if (!r.ok) return setErr(JSON.stringify(j.error));
    await loadSaved();
    setActiveId(j.id);
  };
  const deleteActive = async () => {
    const s = saved.find((x) => x.id === activeId);
    if (!s || !window.confirm(`Delete "${s.name}"?`)) return;
    await fetch(`/api/screens/${s.id}`, { method: "DELETE" });
    setActiveId("");
    loadSaved();
  };
  const clearAll = () => {
    setActiveId(""); setMarkets([]); setIndustries([]); setSnowflake({}); setMetrics([]);
    setKeywords(""); setDetailedOnly(true); setSort({ key: "market_cap", dir: "desc" }); setPage(0);
  };

  const spec = {
    markets, industries, snowflake, keywords, detailedOnly, sort, page, pageSize: PAGE,
    metrics: metrics.filter((m) => m.min !== undefined || m.max !== undefined),
  };
  const specKey = JSON.stringify(spec);
  const loading = loadedKey !== specKey;

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/screen", { method: "POST", body: specKey, signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(j.error));
        setRes(j);
        setErr(null);
        setLoadedKey(specKey);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [specKey]);

  // any filter change resets paging
  const reset = <T,>(set: (v: T) => void) => (v: T) => { setPage(0); set(v); };
  const setM = (i: number, patch: Partial<MetricFilter>) => { setPage(0); setMetrics(metrics.map((m, j) => (j === i ? { ...m, ...patch } : m))); };
  const num = (s: string) => (s === "" ? undefined : Number(s));
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">My Screener</h1>
        <div className="flex items-center gap-2 text-sm">
          <select value={activeId} onChange={(e) => applySaved(e.target.value)} className="rounded border border-white/15 bg-black px-2 py-1">
            <option value="">Saved screens ({saved.length})</option>
            {saved.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {active && (
            <button onClick={toggleAlerts} className={`rounded border px-3 py-1 ${active.alerts_enabled ? "border-amber-400 bg-amber-400/20" : "border-white/15"}`}>
              Alerts {active.alerts_enabled ? "on" : "off"}
            </button>
          )}
          {activeId && <button onClick={deleteActive} className="rounded border border-white/15 px-3 py-1 text-red-300">Delete</button>}
          <button onClick={clearAll} className="rounded border border-white/15 px-3 py-1">Reset</button>
          <button onClick={saveCurrent} className="rounded bg-amber-400 px-3 py-1 font-medium text-black">Save</button>
          <div className="relative">
            <button onClick={() => setShowAlerts(!showAlerts)} className="rounded border border-white/15 px-3 py-1" aria-label="Alerts">
              🔔{unseen > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{unseen}</span>}
            </button>
            {showAlerts && (
              <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-white/15 bg-neutral-950 p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <button onClick={checkNow} disabled={checking} className="rounded border border-white/15 px-2 py-1 disabled:opacity-40">{checking ? "Checking…" : "Check now"}</button>
                  <button onClick={markAllSeen} disabled={!unseen} className="opacity-70 disabled:opacity-30">Mark all seen</button>
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {alerts.map((a) => (
                    <div key={a.id} className={`rounded px-2 py-1.5 text-xs ${a.seen ? "opacity-50" : "bg-white/5"}`}>
                      <span className={a.kind === "entered" ? "text-emerald-400" : "text-red-400"}>{a.kind === "entered" ? "▲ entered" : "▼ left"}</span>{" "}
                      <b>{a.stock_name ?? a.symbol}</b> <span className="opacity-60">({a.symbol})</span>
                      <div className="opacity-60">{a.screen_name} · {new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {!alerts.length && <div className="text-xs opacity-50">No alerts yet. Turn alerts on for a saved screen, then Check now.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
        <span className="text-xs opacity-70" title="Prices stream in for the stocks on this page">
          {liveMode === "connecting" ? "○ connecting…" : liveMode === "offline" ? "○ live feed offline" : `● live · ${liveMode.startsWith("finnhub") ? "Finnhub WebSocket (US) + Yahoo" : "Yahoo polling"}`}
        </span>
        {res?.source === "mock" && <span className="rounded bg-amber-400/20 px-2 py-1 text-xs text-amber-300">Mock data — configure Supabase to use real data</span>}
      </header>

      <section className="grid gap-4 md:grid-cols-[460px_1fr]">
        <div className="rounded-xl border border-white/10 p-4">
          <div className="mb-2 text-xs font-semibold uppercase opacity-60">Snowflake filter (min score)</div>
          <SnowflakeFilter value={snowflake} onChange={reset(setSnowflake)} />
          <div className="mt-2 text-xs opacity-60">
            {SNOWFLAKE_AXES.filter((a) => (snowflake[a.key] ?? 0) > 0).map((a) => `${a.label} ≥ ${snowflake[a.key]}`).join(" · ") || "Click or drag an axis to set a minimum score (0–10)"}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Multi label="Markets" options={facets.markets} value={markets} onChange={reset(setMarkets)} />
            <Multi label="Industries" options={facets.industries} value={industries} onChange={reset(setIndustries)} />
          </div>
          <input
            value={keywords}
            onChange={(e) => { setPage(0); setKeywords(e.target.value); }}
            placeholder="Keywords, e.g. nuclear energy, palladium"
            className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
          />
          <div className="rounded-lg border border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase opacity-60">Metrics</span>
              <select
                className="rounded border border-white/15 bg-black px-2 py-1 text-xs"
                value=""
                onChange={(e) => e.target.value && setMetrics([...metrics, { key: e.target.value }])}
              >
                <option value="">+ Add metric filter</option>
                {METRICS.filter((m) => !metrics.some((x) => x.key === m.key)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            {metrics.map((m, i) => (
              <div key={m.key} className="mb-1.5 flex items-center gap-2 text-sm">
                <span className="w-64 truncate">{metricByKey(m.key)?.label}</span>
                <input type="number" placeholder="min" className="w-24 rounded border border-white/15 bg-transparent px-2 py-1" value={m.min ?? ""} onChange={(e) => setM(i, { min: num(e.target.value) })} />
                <input type="number" placeholder="max" className="w-24 rounded border border-white/15 bg-transparent px-2 py-1" value={m.max ?? ""} onChange={(e) => setM(i, { max: num(e.target.value) })} />
                <button className="opacity-50 hover:opacity-100" onClick={() => { setPage(0); setMetrics(metrics.filter((_, j) => j !== i)); }}>✕</button>
              </div>
            ))}
            {!metrics.length && <div className="text-xs opacity-50">No metric filters</div>}
          </div>
        </div>
      </section>

      <label className="flex items-center gap-2 text-xs opacity-80" title="Stocks are loaded with market data first; full details (sector, scores, growth) fill in nightly">
        <input type="checkbox" checked={detailedOnly} onChange={(e) => { setPage(0); setDetailedOnly(e.target.checked); }} />
        Fully analysed stocks only{coverage ? ` (${coverage.analysed.toLocaleString()} of ${coverage.total.toLocaleString()} loaded)` : ""}
      </label>

      <div className="flex items-center justify-between text-sm">
        <span className={loading ? "opacity-50" : ""}>{res ? `${res.count.toLocaleString()} results` : "Loading…"}{loading && res ? " · updating…" : ""}</span>
        {err && <span className="text-red-400">{err}</span>}
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border border-white/15 px-3 py-1 disabled:opacity-30">Prev</button>
          <button disabled={!res || (page + 1) * PAGE >= res.count} onClick={() => setPage(page + 1)} className="rounded border border-white/15 px-3 py-1 disabled:opacity-30">Next</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-xs uppercase opacity-70">
            <tr>
              <Th sort={sort} onSort={toggleSort} k="name"><span className="float-left">Company</span></Th>
              <Th sort={sort} onSort={toggleSort} k="price">Price</Th>
              <Th sort={sort} onSort={toggleSort} k="ret_7d">7D</Th>
              <Th sort={sort} onSort={toggleSort} k="ret_1y">1Y</Th>
              <Th sort={sort} onSort={toggleSort} k="market_cap">Mkt Cap</Th>
              <Th sort={sort} onSort={toggleSort} k="pe">PE</Th>
              <Th sort={sort} onSort={toggleSort} k="earnings_growth_est_1y">Growth Est.</Th>
              <Th sort={sort} onSort={toggleSort} k="div_yield">Div Yield</Th>
              <Th sort={sort} onSort={toggleSort} k="score_total">Score</Th>
            </tr>
          </thead>
          <tbody>
            {res?.rows.map((r: StockRow) => (
              <tr key={r.symbol} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <MiniSnowflake row={r} />
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs opacity-50">{r.symbol} · {r.exchange} · {r.country}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.currency}{" "}
                  <span key={live[r.symbol]?.at} className={`rounded px-1 ${live[r.symbol]?.dir === 1 ? "flash-up" : live[r.symbol]?.dir === -1 ? "flash-down" : ""}`}>
                    {fmtNum(live[r.symbol]?.price ?? r.price, 2)}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right ${(r.ret_7d ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>{pct(r.ret_7d)}</td>
                <td className={`px-3 py-2 text-right ${(r.ret_1y ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>{pct(r.ret_1y)}</td>
                <td className="px-3 py-2 text-right">{fmtCap(r.market_cap)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(r.pe)}</td>
                <td className="px-3 py-2 text-right">{pct(r.earnings_growth_est_1y)}</td>
                <td className="px-3 py-2 text-right">{pct(r.div_yield)}</td>
                <td className="px-3 py-2 text-right">{r.score_total ?? "–"}/{MAX_TOTAL}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
