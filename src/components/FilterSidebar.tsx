"use client";
import { useEffect, useState } from "react";
import { CAP_SIZES, METRIC_GROUPS, METRICS, SNOWFLAKE_AXES, metricByKey } from "@/lib/metrics";
import { Chips, SearchMulti, type Facet } from "./filters";
import { SnowflakeFilter } from "./SnowflakeFilter";
import { Section } from "./ui";

export interface MetricFilter { key: string; min?: number; max?: number }
export interface Filters {
  regions: string[];
  markets: string[];
  sectors: string[];
  industries: string[];
  capSizes: string[];
  snowflake: Record<string, number>;
  metrics: MetricFilter[];
  detailedOnly: boolean;
}
export const EMPTY_FILTERS: Filters = { regions: [], markets: [], sectors: [], industries: [], capSizes: [], snowflake: {}, metrics: [], detailedOnly: true };
export type FacetSet = Record<"regions" | "markets" | "sectors" | "industries", Facet[]>;

/** min/max inputs keep a local draft and only commit after typing pauses, so the table doesn't flicker per keystroke. */
function MetricRow({ m, onChange, onRemove }: { m: MetricFilter; onChange: (p: Partial<MetricFilter>) => void; onRemove: () => void }) {
  const [min, setMin] = useState(m.min?.toString() ?? "");
  const [max, setMax] = useState(m.max?.toString() ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      const n = (s: string) => (s.trim() === "" || isNaN(Number(s)) ? undefined : Number(s));
      if (n(min) !== m.min || n(max) !== m.max) onChange({ min: n(min), max: n(max) });
    }, 450);
    return () => clearTimeout(t);
  }, [min, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = metricByKey(m.key);
  const unit = def?.fmt === "pct" ? "%" : def?.key === "market_cap_usd" ? "$" : "";
  const field = "w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs tabular-nums text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-amber-400/60";
  return (
    <div className="fade-in rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-zinc-300">{def?.label}</span>
        <button onClick={onRemove} className="text-zinc-600 transition-colors hover:text-red-400" aria-label="Remove">✕</button>
      </div>
      <div className="flex items-center gap-1.5">
        <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder={`min ${unit}`} className={field} />
        <span className="text-zinc-600">–</span>
        <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder={`max ${unit}`} className={field} />
      </div>
    </div>
  );
}

export function FilterSidebar({
  filters,
  update,
  facets,
  coverage,
  resultCount,
  onDone,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  facets: FacetSet;
  coverage: { total: number; analysed: number } | null;
  resultCount?: number;
  onDone?: () => void;
}) {
  const f = filters;
  const sfActive = SNOWFLAKE_AXES.filter((a) => (f.snowflake[a.key] ?? 0) > 0).length;
  const marketActive = f.regions.length + f.markets.length + f.capSizes.length;
  const sectorActive = f.sectors.length + f.industries.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Section title="Snowflake" badge={sfActive}>
          <div className="-mx-2 text-zinc-300">
            <SnowflakeFilter value={f.snowflake} onChange={(snowflake) => update({ snowflake })} />
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {sfActive
              ? SNOWFLAKE_AXES.filter((a) => (f.snowflake[a.key] ?? 0) > 0).map((a) => `${a.label} ≥ ${f.snowflake[a.key]}`).join(" · ")
              : "Click or drag along an axis to require a minimum score (0–10). Click the same point again to clear it."}
          </p>
        </Section>

        <Section title="Market & size" badge={marketActive}>
          <Chips label="Region" options={facets.regions.map((x) => ({ key: x.name, label: x.name, count: x.count }))} value={f.regions} onChange={(regions) => update({ regions })} />
          <SearchMulti label={`Country (${facets.markets.length})`} options={facets.markets} value={f.markets} onChange={(markets) => update({ markets })} placeholder="Search countries…" />
          <Chips label="Company size (USD market cap)" options={CAP_SIZES.map((c) => ({ key: c.key, label: c.label }))} value={f.capSizes} onChange={(capSizes) => update({ capSizes })} />
        </Section>

        <Section title="Sector & industry" badge={sectorActive}>
          <Chips label="Sector" options={facets.sectors.map((x) => ({ key: x.name, label: x.name, count: x.count }))} value={f.sectors} onChange={(sectors) => update({ sectors })} />
          <SearchMulti label={`Industry (${facets.industries.length})`} options={facets.industries} value={f.industries} onChange={(industries) => update({ industries })} placeholder="e.g. semiconductors, banks…" />
        </Section>

        <Section title="Metrics" badge={f.metrics.filter((m) => m.min !== undefined || m.max !== undefined).length}>
          <select
            value=""
            onChange={(e) => e.target.value && update({ metrics: [...f.metrics, { key: e.target.value }] })}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-amber-400/60"
          >
            <option value="">+ Add a metric filter ({METRICS.length} available)</option>
            {METRIC_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {METRICS.filter((m) => m.group === g && !f.metrics.some((x) => x.key === m.key)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </optgroup>
            ))}
          </select>
          {f.metrics.map((m, i) => (
            <MetricRow
              key={m.key}
              m={m}
              onChange={(p) => update({ metrics: f.metrics.map((x, j) => (j === i ? { ...x, ...p } : x)) })}
              onRemove={() => update({ metrics: f.metrics.filter((_, j) => j !== i) })}
            />
          ))}
        </Section>
      </div>

      <label className="flex cursor-pointer items-start gap-2 border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-400">
        <input type="checkbox" className="mt-0.5 accent-amber-400" checked={f.detailedOnly} onChange={(e) => update({ detailedOnly: e.target.checked })} />
        <span>
          Only fully analysed stocks
          {coverage && <span className="block text-zinc-600">{coverage.analysed.toLocaleString()} of {coverage.total.toLocaleString()} analysed so far</span>}
        </span>
      </label>
      {onDone && (
        <div className="border-t border-white/[0.06] p-3 md:hidden">
          <button onClick={onDone} className="w-full rounded-lg bg-amber-400 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-300">
            Show {resultCount?.toLocaleString() ?? ""} results
          </button>
        </div>
      )}
    </div>
  );
}
