"use client";
import { useEffect, useRef, useState } from "react";
import { PRESETS, type Preset } from "@/lib/presets";
import { btn } from "./ui";

/** Horizontal strip of idea cards, shown above the results when no filters are active. */
export function IdeasStrip({ onApply }: { onApply: (p: Preset) => void }) {
  return (
    <div className="fade-in">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Investing ideas</div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onApply(p)}
            className="group w-56 shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-400/40 hover:bg-white/[0.05]"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <span className="text-base">{p.emoji}</span>
              <span className="truncate group-hover:text-white">{p.title}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500">{p.blurb}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Banner shown while an idea is applied: what it is, plus one-click save + alerts. */
export function IdeaBanner({ preset, saved, onSaveWithAlerts, onClose }: { preset: Preset; saved: boolean; onSaveWithAlerts: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fade-in flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5">
      <span className="text-lg">{preset.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-amber-100">{preset.title}</div>
        <div className="text-xs text-zinc-400">{preset.blurb} Adjust any filter on the left to make it your own.</div>
      </div>
      {saved ? (
        <span className="text-xs text-emerald-300">✓ Saved with alerts on</span>
      ) : (
        <button
          className="whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onSaveWithAlerts(); } finally { setBusy(false); } }}
        >
          {busy ? "Saving…" : "Save & get alerts"}
        </button>
      )}
      <button onClick={onClose} className="text-zinc-500 transition-colors hover:text-zinc-200" aria-label="Clear idea">✕</button>
    </div>
  );
}

/** Top-bar menu listing every idea, always reachable even when filters are active. */
export function IdeasMenu({ activeId, onApply }: { activeId: string | null; onApply: (p: Preset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className={`${btn} flex items-center gap-1.5 ${open ? "bg-white/[0.08]" : ""}`}>
        <span>💡</span><span className="hidden sm:inline">Ideas</span>
      </button>
      {open && (
        <div className="fade-in absolute right-0 z-40 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl shadow-black/60">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => { onApply(p); setOpen(false); }}
              className={`flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${p.id === activeId ? "bg-amber-400/10" : "hover:bg-white/[0.06]"}`}
            >
              <span className="text-base leading-5">{p.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm text-zinc-100">{p.title}</span>
                <span className="block text-xs leading-snug text-zinc-500">{p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
