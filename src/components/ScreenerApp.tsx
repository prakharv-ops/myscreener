"use client";
import { useCallback, useEffect, useState } from "react";
import { CAP_SIZES, SNOWFLAKE_AXES, metricByKey } from "@/lib/metrics";
import { useLive } from "@/lib/use-live";
import type { ScreenAlert } from "@/lib/alerts";
import type { SavedScreen } from "@/lib/saved";
import type { ScreenResult } from "@/lib/screen";
import { EMPTY_FILTERS, FilterSidebar, type FacetSet, type Filters } from "./FilterSidebar";
import { IdeaBanner, IdeasMenu, IdeasStrip } from "./Ideas";
import { AlertsMenu, SavedMenu } from "./Menus";
import { PRESETS, type Preset } from "@/lib/presets";
import { ResultsTable, VIEWS } from "./ResultsTable";
import { StockDrawer } from "./StockDrawer";
import { btn, Pill } from "./ui";

const DEFAULT_SORT = { key: "market_cap_usd", dir: "desc" as "asc" | "desc" };

export function ScreenerApp() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [keywords, setKeywords] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [view, setView] = useState(0);
  const [res, setRes] = useState<ScreenResult | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [facets, setFacets] = useState<FacetSet>({ regions: [], markets: [], sectors: [], industries: [] });
  const [coverage, setCoverage] = useState<{ total: number; analysed: number } | null>(null);
  const [saved, setSaved] = useState<SavedScreen[]>([]);
  const [activeId, setActiveId] = useState("");
  const [alerts, setAlerts] = useState<ScreenAlert[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile only
  const [presetId, setPresetId] = useState<string | null>(null);

  const { prices: live, mode: liveMode } = useLive((res?.rows ?? []).map((r) => r.symbol));

  // ---------- data loading ----------
  const loadSaved = () => fetch("/api/screens").then((r) => r.json()).then((j) => Array.isArray(j) && setSaved(j)).catch(() => {});
  const loadAlerts = () => fetch("/api/alerts").then((r) => r.json()).then((j) => Array.isArray(j) && setAlerts(j)).catch(() => {});
  useEffect(() => {
    loadSaved();
    loadAlerts();
    fetch("/api/facets").then((r) => r.json()).then((j) => {
      if (j.total) setCoverage({ total: j.total, analysed: j.analysed });
      if (j.markets) setFacets({ regions: j.regions ?? [], markets: j.markets, sectors: j.sectors ?? [], industries: j.industries ?? [] });
    }).catch(() => {});
  }, []);

  // keyword box: debounce typing
  useEffect(() => {
    const t = setTimeout(() => { if (kwDraft !== keywords) { setKeywords(kwDraft); setPage(0); } }, 350);
    return () => clearTimeout(t);
  }, [kwDraft, keywords]);

  const spec = {
    ...filters,
    metrics: filters.metrics.filter((m) => m.min !== undefined || m.max !== undefined),
    keywords, sort, page, pageSize,
  };
  const specKey = JSON.stringify(spec);
  const loading = loadedKey !== specKey;

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/screen", { method: "POST", body: specKey, signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "Query failed");
        setRes(j);
        setErr(null);
        setLoadedKey(specKey);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      }
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [specKey]);

  // ---------- actions ----------
  const update = useCallback((patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); setActiveId(""); setPresetId(null); }, []);
  const clearAll = () => { setFilters(EMPTY_FILTERS); setKwDraft(""); setKeywords(""); setSort(DEFAULT_SORT); setPage(0); setActiveId(""); setPresetId(null); };
  const applyPreset = (p: Preset) => {
    setFilters({ ...EMPTY_FILTERS, ...p.filters, snowflake: { ...(p.filters.snowflake ?? {}) }, metrics: [...(p.filters.metrics ?? [])] });
    setKwDraft(""); setKeywords(""); setSort(p.sort); setPage(0); setActiveId(""); setPresetId(p.id); setSidebarOpen(false);
  };
  const toggleSort = (key: string) => { setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" })); setPage(0); };
  const closeDrawer = useCallback(() => setSelected(null), []);

  const applySaved = (id: string) => {
    const s = saved.find((x) => x.id === id)?.spec;
    if (!s) return;
    setFilters({
      regions: s.regions ?? [], markets: s.markets ?? [], sectors: s.sectors ?? [], industries: s.industries ?? [],
      capSizes: s.capSizes ?? [], snowflake: s.snowflake ?? {}, metrics: s.metrics ?? [], detailedOnly: s.detailedOnly ?? true,
    });
    setKwDraft(s.keywords ?? ""); setKeywords(s.keywords ?? "");
    setSort(s.sort ?? DEFAULT_SORT); setPage(0);
    setActiveId(id);
  };
  const saveCurrent = async (name: string): Promise<string | null> => {
    const r = await fetch("/api/screens", { method: "POST", body: JSON.stringify({ name, spec }) });
    const j = await r.json();
    if (!r.ok) { setErr("Couldn't save the screen"); return null; }
    await loadSaved();
    setActiveId(j.id);
    return j.id;
  };
  const saveWithAlerts = async (name: string) => {
    const id = await saveCurrent(name);
    if (!id) return;
    await fetch(`/api/screens/${id}`, { method: "PATCH", body: JSON.stringify({ alerts_enabled: true }) });
    await loadSaved();
  };
  const deleteSaved = async (id: string) => {
    await fetch(`/api/screens/${id}`, { method: "DELETE" });
    if (id === activeId) setActiveId("");
    loadSaved();
  };
  const toggleAlerts = async (s: SavedScreen) => {
    await fetch(`/api/screens/${s.id}`, { method: "PATCH", body: JSON.stringify({ alerts_enabled: !s.alerts_enabled }) });
    loadSaved();
  };
  const checkAlerts = async () => {
    const r = await fetch("/api/alerts/run", { method: "POST" });
    if (!r.ok) setErr(`Alert check failed (${r.status})`);
    loadAlerts();
    loadSaved();
  };
  const markSeen = async () => { await fetch("/api/alerts", { method: "POST", body: "{}" }); loadAlerts(); };
  const exportCsv = async () => {
    const r = await fetch("/api/export", { method: "POST", body: specKey });
    if (!r.ok) return setErr(`Export failed (${r.status})`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `screen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- active filter pills ----------
  const pills: { label: string; remove: () => void }[] = [
    ...filters.regions.map((v) => ({ label: v, remove: () => update({ regions: filters.regions.filter((x) => x !== v) }) })),
    ...filters.markets.map((v) => ({ label: v, remove: () => update({ markets: filters.markets.filter((x) => x !== v) }) })),
    ...filters.capSizes.map((v) => ({ label: `${CAP_SIZES.find((c) => c.key === v)?.label.split(" ")[0]} cap`, remove: () => update({ capSizes: filters.capSizes.filter((x) => x !== v) }) })),
    ...filters.sectors.map((v) => ({ label: v, remove: () => update({ sectors: filters.sectors.filter((x) => x !== v) }) })),
    ...filters.industries.map((v) => ({ label: v, remove: () => update({ industries: filters.industries.filter((x) => x !== v) }) })),
    ...SNOWFLAKE_AXES.filter((a) => (filters.snowflake[a.key] ?? 0) > 0).map((a) => ({
      label: `${a.label} ≥ ${filters.snowflake[a.key]}`,
      remove: () => update({ snowflake: { ...filters.snowflake, [a.key]: 0 } }),
    })),
    ...filters.metrics.filter((m) => m.min !== undefined || m.max !== undefined).map((m) => {
      const label = metricByKey(m.key)?.label.replace(/ \(.*\)$/, "") ?? m.key;
      const range = m.min !== undefined && m.max !== undefined ? `${m.min}–${m.max}` : m.min !== undefined ? `≥ ${m.min}` : `≤ ${m.max}`;
      return { label: `${label} ${range}`, remove: () => update({ metrics: filters.metrics.filter((x) => x.key !== m.key) }) };
    }),
    ...(keywords ? [{ label: `"${keywords}"`, remove: () => { setKwDraft(""); setKeywords(""); } }] : []),
  ];

  const preset = PRESETS.find((p) => p.id === presetId) ?? null;
  const activeSaved = saved.find((s) => s.id === activeId);

  const from = res && res.count ? page * pageSize + 1 : 0;
  const to = res ? Math.min((page + 1) * pageSize, res.count) : 0;
  const pages = res ? Math.max(1, Math.ceil(res.count / pageSize)) : 1;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ---------- top bar ---------- */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b sm:gap-3 border-white/[0.06] bg-zinc-950/80 px-4 backdrop-blur">
        <button className={`${btn} shrink-0 md:hidden`} onClick={() => setSidebarOpen(true)}>Filters{pills.length ? ` (${pills.length})` : ""}</button>
        <div className="flex items-center gap-2">
          <svg className="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" strokeLinecap="round" /></svg>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">MyScreener</span>
        </div>
        <div className="relative min-w-0 max-w-md flex-1 sm:mx-2">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.4 9.8l3.1 3.2a.8.8 0 1 0 1.1-1.1l-3.1-3.2A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" /></svg>
          <input
            value={kwDraft}
            onChange={(e) => setKwDraft(e.target.value)}
            placeholder="Search companies or themes…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/[0.05]"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 lg:flex" title="Prices update live for the stocks on screen">
            <span className={`h-1.5 w-1.5 rounded-full ${liveMode === "offline" ? "bg-red-400" : liveMode === "connecting" ? "bg-zinc-500" : "animate-pulse bg-emerald-400"}`} />
            {liveMode === "connecting" ? "connecting" : liveMode === "offline" ? "live feed offline" : liveMode.startsWith("finnhub") ? "live · Finnhub + Yahoo" : "live · Yahoo"}
          </span>
          <IdeasMenu activeId={presetId} onApply={applyPreset} />
          <SavedMenu saved={saved} activeId={activeId} onApply={applySaved} onSave={saveCurrent} onDelete={deleteSaved} onToggleAlerts={toggleAlerts} />
          <AlertsMenu alerts={alerts} onCheck={checkAlerts} onMarkSeen={markSeen} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------- filters ---------- */}
        {sidebarOpen && <div className="fade-in fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[340px] max-w-[88vw] shrink-0 border-r border-white/[0.06] bg-zinc-950 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <FilterSidebar filters={filters} update={update} facets={facets} coverage={coverage} resultCount={res?.count} onDone={() => setSidebarOpen(false)} />
        </aside>

        {/* ---------- results ---------- */}
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {preset && <IdeaBanner key={preset.id} preset={preset} saved={!!activeSaved?.alerts_enabled} onSaveWithAlerts={() => saveWithAlerts(preset.title)} onClose={clearAll} />}
          {pills.length === 0 && <IdeasStrip onApply={applyPreset} />}
          {pills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {pills.map((p, i) => <Pill key={p.label + i} onRemove={p.remove}>{p.label}</Pill>)}
              <button onClick={clearAll} className="ml-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200">Clear all</button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums text-zinc-50">{res ? res.count.toLocaleString() : "—"}</span>
              <span className="text-sm text-zinc-500">stocks match</span>
              <span className={`h-3 w-3 animate-spin self-center rounded-full border-2 border-zinc-600 border-t-amber-400 transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
              {res?.source === "mock" && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">mock data</span>}
            </div>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
              {VIEWS.map((v, i) => (
                <button
                  key={v.label}
                  onClick={() => setView(i)}
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-all ${view === i ? "bg-white/10 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-200"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <button onClick={exportCsv} disabled={!res?.count} className={btn} title="Download every matching stock (up to 5,000) as CSV">Export CSV</button>
          </div>

          {err && <div className="fade-in rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}

          <ResultsTable
            rows={res?.rows ?? []}
            view={view}
            sort={sort}
            onSort={toggleSort}
            live={live}
            loading={loading}
            firstLoad={!res}
            selected={selected}
            onSelect={setSelected}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span className="tabular-nums">{res?.count ? `${from.toLocaleString()}–${to.toLocaleString()} of ${res.count.toLocaleString()}` : ""}</span>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <button className={btn} disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="tabular-nums">Page {page + 1} of {pages.toLocaleString()}</span>
              <button className={btn} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          </div>
        </main>
      </div>

      <StockDrawer symbol={selected} live={live} onClose={closeDrawer} />
    </div>
  );
}
