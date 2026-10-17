"use client";
import { useMemo, useState } from "react";

export interface Facet { name: string; count: number }

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition-all duration-150 ${
    on ? "border-amber-400/70 bg-amber-400/15 text-amber-100" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
  }`;

export function Label({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
      <span>{children}</span>
      {onClear && <button className="text-zinc-500 transition-colors hover:text-amber-300" onClick={onClear}>clear</button>}
    </div>
  );
}

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
    <div>
      <Label onClear={value.length ? () => onChange([]) : undefined}>{label}</Label>
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
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !value.includes(o.name) && (!s || o.name.toLowerCase().includes(s))).slice(0, 50);
  }, [q, options, value]);
  const pick = (name: string) => { onChange([...value, name]); setQ(""); setHi(0); };

  return (
    <div className="relative">
      <Label onClear={value.length ? () => onChange([]) : undefined}>{label}</Label>
      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button key={v} onClick={() => onChange(value.filter((x) => x !== v))} className={`${chip(true)} fade-in`} title="Remove">
              {v} <span className="opacity-60">✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && matches[hi]) { e.preventDefault(); pick(matches[hi].name); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-amber-400/60"
      />
      {open && matches.length > 0 && (
        <div className="fade-in absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-2xl shadow-black/60">
          {matches.map((o, i) => (
            <button
              key={o.name}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o.name)}
              className={`flex w-full justify-between px-3 py-1.5 text-left text-xs transition-colors ${i === hi ? "bg-white/10 text-white" : "text-zinc-300"}`}
            >
              <span>{o.name}</span>
              <span className="text-zinc-500">{o.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
