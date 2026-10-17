"use client";
import { useEffect, useRef, useState } from "react";
import type { ScreenAlert } from "@/lib/alerts";
import type { SavedScreen } from "@/lib/saved";
import { btn, btnPrimary, input } from "./ui";

/** Small popover that closes on outside click / Escape. */
function Popover({ button, children, align = "right", width = "w-80" }: { button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; width?: string }) {
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
      {button(open, () => setOpen(!open))}
      {open && (
        <div className={`fade-in absolute ${align === "right" ? "right-0" : "left-0"} z-40 mt-2 ${width} rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-2xl shadow-black/60`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function SavedMenu({
  saved,
  activeId,
  onApply,
  onSave,
  onDelete,
  onToggleAlerts,
}: {
  saved: SavedScreen[];
  activeId: string;
  onApply: (id: string) => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (id: string) => void;
  onToggleAlerts: (s: SavedScreen) => void;
}) {
  const [name, setName] = useState("");
  const active = saved.find((s) => s.id === activeId);
  return (
    <Popover
      width="w-96"
      button={(open, toggle) => (
        <button onClick={toggle} className={`${btn} flex max-w-56 items-center gap-2 ${open ? "bg-white/[0.08]" : ""}`}>
          <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 0 0-2 2v12l7-3 7 3V5a2 2 0 0 0-2-2H5Z" /></svg>
          <span className="hidden truncate sm:inline">{active ? active.name : `Saved screens${saved.length ? ` (${saved.length})` : ""}`}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-2">
          <form
            className="flex gap-2 p-1"
            onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await onSave(name.trim()); setName(""); close(); }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name the current screen…" className={input} autoFocus />
            <button className={btnPrimary} disabled={!name.trim()}>Save</button>
          </form>
          <div className="max-h-72 overflow-y-auto">
            {saved.map((s) => (
              <div key={s.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${s.id === activeId ? "bg-amber-400/10" : "hover:bg-white/[0.06]"}`}>
                <button className="min-w-0 flex-1 truncate text-left text-zinc-200" onClick={() => { onApply(s.id); close(); }}>{s.name}</button>
                <button
                  onClick={() => onToggleAlerts(s)}
                  title={s.alerts_enabled ? "Alerts on (click to turn off)" : "Turn alerts on"}
                  className={`rounded-md px-1.5 py-0.5 text-xs transition-colors ${s.alerts_enabled ? "bg-amber-400/20 text-amber-200" : "text-zinc-500 hover:text-zinc-200"}`}
                >
                  {s.alerts_enabled ? "🔔 on" : "🔕"}
                </button>
                <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) onDelete(s.id); }} className="rounded-md px-1.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100" title="Delete">✕</button>
              </div>
            ))}
            {!saved.length && <div className="px-2 py-3 text-xs text-zinc-500">No saved screens yet. Set some filters, name them above and save.</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}

export function AlertsMenu({ alerts, onCheck, onMarkSeen }: { alerts: ScreenAlert[]; onCheck: () => Promise<void>; onMarkSeen: () => void }) {
  const [checking, setChecking] = useState(false);
  const unseen = alerts.filter((a) => !a.seen).length;
  return (
    <Popover
      button={(open, toggle) => (
        <button onClick={toggle} className={`${btn} relative ${open ? "bg-white/[0.08]" : ""}`} aria-label="Alerts">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 0 0-6 6v3.6l-1.7 2.6A1 1 0 0 0 3.1 16h13.8a1 1 0 0 0 .8-1.6L16 11.6V8a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 2.8-2H7.2A3 3 0 0 0 10 20Z" /></svg>
          {unseen > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{unseen}</span>}
        </button>
      )}
    >
      {() => (
        <div>
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="text-sm font-medium text-zinc-200">Alerts</span>
            <div className="flex gap-2 text-xs">
              <button onClick={async () => { setChecking(true); try { await onCheck(); } finally { setChecking(false); } }} disabled={checking} className="text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-40">{checking ? "Checking…" : "Check now"}</button>
              <button onClick={onMarkSeen} disabled={!unseen} className="text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30">Mark all read</button>
            </div>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {alerts.map((a) => (
              <div key={a.id} className={`rounded-lg px-2 py-1.5 text-xs ${a.seen ? "text-zinc-500" : "bg-white/[0.04] text-zinc-200"}`}>
                <span className={a.kind === "entered" ? "text-emerald-400" : "text-red-400"}>{a.kind === "entered" ? "▲ entered" : "▼ left"}</span>{" "}
                <b className="font-medium">{a.stock_name ?? a.symbol}</b> <span className="text-zinc-500">{a.symbol}</span>
                <div className="text-zinc-500">{a.screen_name} · {new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
            {!alerts.length && <div className="px-2 py-3 text-xs text-zinc-500">No alerts yet. Turn alerts on for a saved screen; stocks entering or leaving it show up here.</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}
