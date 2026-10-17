"use client";
import { useState } from "react";

/** Collapsible sidebar section. Badge shows how many filters inside are active. */
export function Section({ title, badge, defaultOpen = true, children }: { title: string; badge?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-white/[0.06]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200">
        <span className="flex items-center gap-2">
          {title}
          {!!badge && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] leading-4 text-black">{badge}</span>}
        </span>
        <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="space-y-3 px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Pill({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="fade-in inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 py-0.5 pl-2.5 pr-1 text-xs text-amber-100">
      {children}
      <button onClick={onRemove} className="rounded-full p-0.5 text-amber-200/70 transition-colors hover:bg-amber-400/20 hover:text-amber-100" aria-label="Remove filter">
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 5.3a1 1 0 0 0-1.4 1.4L8.6 10l-3.7 3.3a1 1 0 1 0 1.4 1.4L10 11.4l3.3 3.3a1 1 0 0 0 1.4-1.4L11.4 10l3.3-3.3a1 1 0 0 0-1.4-1.4L10 8.6 6.3 5.3Z" /></svg>
      </button>
    </span>
  );
}

export const btn = "whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35";
export const btnPrimary = "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-amber-300 disabled:opacity-40";
export const input = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/[0.05]";
