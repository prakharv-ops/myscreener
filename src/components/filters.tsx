"use client";
import { useMemo, useState } from "react";

export interface Facet { name: string; count: number }

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-amber-400 bg-amber-400/20" : "border-white/15 opacity-70 hover:opacity-100"}`;

/** Toggle chips for short option lists (regions, sectors, cap sizes). */
export function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string; count?: number }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="mb-2 flex justify-between text-xs font-semibold uppercase opacity-60">
        <span>{label}</span>
        {value.length > 0 && <button className="normal-case opacity-80" onClick={() => onChange([])}>clear</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <button key={o.key} onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])} className={chip(on)}>
              {o.label}
              {o.count !== undefined && <span className="ml-1 opacity-50">{o.count.toLocaleString()}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Type-to-search multi-select for long lists (countries, ~150 industries). */
export function SearchMulti({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: Facet[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !value.includes(o.name) && (!s || o.name.toLowerCase().includes(s))).slice(0, 40);
  }, [q, options, value]);

  return (
    <div className="relative rounded-lg border border-white/10 p-3">
      <div className="mb-2 flex justify-between text-xs font-semibold uppercase opacity-60">
        <span>{label}</span>
        {value.length > 0 && <button className="normal-case opacity-80" onClick={() => onChange([])}>clear</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <button key={v} onClick={() => onChange(value.filter((x) => x !== v))} className={chip(true)} title="Remove">
            {v} ✕
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length ? "add more…" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-xs outline-none"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-neutral-950 py-1 shadow-xl">
          {matches.map((o) => (
            <button
              key={o.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange([...value, o.name]); setQ(""); }}
              className="flex w-full justify-between px-3 py-1.5 text-left text-xs hover:bg-white/10"
            >
              <span>{o.name}</span>
              <span className="opacity-50">{o.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
