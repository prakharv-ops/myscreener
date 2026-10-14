"use client";
import { useRef } from "react";
import { SNOWFLAKE_AXES } from "@/lib/metrics";

const C = 170, STEP = 22, N = SNOWFLAKE_AXES.length;
const angle = (i: number) => ((-90 + i * 72) * Math.PI) / 180;
const pt = (i: number, level: number) => [C + Math.cos(angle(i)) * level * STEP, C + Math.sin(angle(i)) * level * STEP] as const;
const poly = (levels: number[]) => levels.map((l, i) => pt(i, l).join(",")).join(" ");

/** Click or drag anywhere: the nearest axis gets a minimum score equal to the nearest ring. */
export function SnowflakeFilter({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ axis: number; startLevel: number; moved: boolean } | null>(null);
  const mins = SNOWFLAKE_AXES.map((a) => value[a.key] ?? 0);

  const locate = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 340 - C;
    const y = ((e.clientY - r.top) / r.height) * 340 - C;
    let theta = Math.atan2(y, x) * (180 / Math.PI) + 90; // 0° = top axis
    theta = ((theta % 360) + 360) % 360;
    const axis = Math.round(theta / 72) % N;
    const level = Math.max(0, Math.min(6, Math.round(Math.hypot(x, y) / STEP)));
    return { axis, level };
  };
  const set = (axis: number, level: number) => {
    const key = SNOWFLAKE_AXES[axis].key;
    if ((value[key] ?? 0) !== level) onChange({ ...value, [key]: level });
  };

  return (
    <svg
      ref={svg}
      viewBox="0 0 340 340"
      className="w-full max-w-[340px] cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const { axis, level } = locate(e);
        drag.current = { axis, startLevel: mins[axis], moved: false };
        set(axis, level);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { level } = locate(e);
        drag.current.moved = true;
        set(drag.current.axis, level); // stay on the axis we grabbed
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        // plain click on the already-selected ring clears that axis
        if (!d.moved && d.startLevel === locate(e).level && d.startLevel > 0) set(d.axis, 0);
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((l) => (
        <polygon key={l} points={poly(Array(N).fill(l))} fill="none" stroke="currentColor" strokeOpacity={l === 6 ? 0.3 : 0.15} />
      ))}
      {SNOWFLAKE_AXES.map((_, i) => (
        <line key={i} x1={C} y1={C} x2={pt(i, 6)[0]} y2={pt(i, 6)[1]} stroke="currentColor" strokeOpacity={0.2} />
      ))}
      {mins.some((m) => m > 0) && <polygon points={poly(mins)} fill="#f5b942" fillOpacity={0.3} stroke="#f5b942" strokeWidth={2} strokeLinejoin="round" />}
      {SNOWFLAKE_AXES.map((a, i) => {
        const [lx, ly] = pt(i, 7.5);
        const on = mins[i] > 0;
        return (
          <g key={a.key} pointerEvents="none">
            {[1, 2, 3, 4, 5, 6].map((l) => {
              const [x, y] = pt(i, l);
              return <circle key={l} cx={x} cy={y} r={l === mins[i] ? 7 : 3.5} fill={l <= mins[i] ? "#f5b942" : "currentColor"} fillOpacity={l <= mins[i] ? 1 : 0.3} />;
            })}
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className={`text-[11px] font-semibold uppercase ${on ? "fill-amber-400" : "fill-current opacity-70"}`}>
              {a.label}{on ? ` ≥ ${mins[i]}` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
