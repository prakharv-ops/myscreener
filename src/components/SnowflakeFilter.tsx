"use client";
import { useEffect, useRef, useState } from "react";
import { MAX_AXIS, SNOWFLAKE_AXES } from "@/lib/metrics";

const N = SNOWFLAKE_AXES.length;
const W = 460, H = 420, CX = 230, CY = 210, R = 150, STEP = R / MAX_AXIS;
const SNAP = 0.5; // smooth: half-point steps on a 0–10 scale
const COMMIT_MS = 120; // throttle for pushing a drag to the query layer

const ang = (i: number) => ((-90 + (i * 360) / N) * Math.PI) / 180;
const pt = (i: number, level: number) => [CX + Math.cos(ang(i)) * level * STEP, CY + Math.sin(ang(i)) * level * STEP] as const;
const path = (levels: number[]) => levels.map((l, i) => `${i ? "L" : "M"}${pt(i, l).join(",")}`).join("") + "Z";
const ring = (l: number) => path(Array(N).fill(l));

/**
 * Click or drag on an axis to set its minimum score (0–10, half-point steps). The shape follows the
 * pointer immediately from local state; the query layer is updated on a short throttle.
 */
export function SnowflakeFilter({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ axis: number; startLevel: number; moved: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(value); // newest values, readable synchronously from pointer handlers
  const shown = draft ?? value;
  const mins = SNOWFLAKE_AXES.map((a) => shown[a.key] ?? 0);

  // drop the local draft once the parent has caught up (or changed it, e.g. Reset / loading a saved screen)
  useEffect(() => {
    if (drag.current) return;
    latest.current = value;
    setDraft(null);
  }, [value]);

  const commit = (v: Record<string, number>, immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate) return onChange(v);
    timer.current = setTimeout(() => onChange(v), COMMIT_MS);
  };

  const locate = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - CX;
    const y = ((e.clientY - r.top) / r.height) * H - CY;
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360; // 0° = top axis, clockwise
    const axis = Math.round(deg / (360 / N)) % N;
    // project onto the axis so dragging along it is smooth even when the pointer drifts sideways
    const proj = x * Math.cos(ang(axis)) + y * Math.sin(ang(axis));
    const level = Math.max(0, Math.min(MAX_AXIS, Math.round(proj / STEP / SNAP) * SNAP));
    return { axis, level };
  };
  const set = (axis: number, level: number, immediate = false) => {
    const key = SNOWFLAKE_AXES[axis].key;
    if ((latest.current[key] ?? 0) === level) return;
    const next = { ...latest.current, [key]: level };
    latest.current = next;
    setDraft(next);
    commit(next, immediate);
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[460px] cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const { axis, level } = locate(e);
        drag.current = { axis, startLevel: mins[axis], moved: false };
        setDragging(true);
        set(axis, level);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.moved = true;
        set(d.axis, locate(e).level); // stay on the axis we grabbed
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (!d) return;
        // a plain click on the already-selected level clears that axis
        if (!d.moved && d.startLevel > 0 && Math.abs(d.startLevel - locate(e).level) < SNAP) set(d.axis, 0);
        commit(latest.current, true); // flush now
      }}
    >
      {[2, 4, 6, 8, 10].map((l) => (
        <path key={l} d={ring(l)} fill="none" stroke="currentColor" strokeOpacity={l === 10 ? 0.3 : 0.14} />
      ))}
      {SNOWFLAKE_AXES.map((_, i) => (
        <line key={i} x1={CX} y1={CY} x2={pt(i, MAX_AXIS)[0]} y2={pt(i, MAX_AXIS)[1]} stroke="currentColor" strokeOpacity={0.18} />
      ))}
      {[2, 4, 6, 8].map((l) => (
        <text key={l} x={CX + 4} y={CY - l * STEP + 3} className="fill-current text-[8px] opacity-40" pointerEvents="none">{l}</text>
      ))}
      {mins.some((m) => m > 0) && (
        <path d={path(mins)} fill="#f5b942" fillOpacity={0.28} stroke="#f5b942" strokeWidth={2} strokeLinejoin="round" style={{ transition: dragging ? "none" : "d 140ms ease-out" }} />
      )}
      {SNOWFLAKE_AXES.map((a, i) => {
        const on = mins[i] > 0;
        const [hx, hy] = pt(i, mins[i]);
        const [lx, ly] = pt(i, MAX_AXIS + 1.1);
        const cos = Math.cos(ang(i));
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <g key={a.key} pointerEvents="none">
            {on && <circle cx={hx} cy={hy} r={6} fill="#f5b942" stroke="#0a0a0a" strokeWidth={2} />}
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className={`text-[11px] font-semibold uppercase ${on ? "fill-amber-400" : "fill-current opacity-70"}`}>
              {a.label}
            </text>
            {on && (
              <text x={lx} y={ly + 13} textAnchor={anchor} dominantBaseline="middle" className="fill-amber-400 text-[10px]">
                ≥ {mins[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
