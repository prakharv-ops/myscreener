"use client";
import { SNOWFLAKE_AXES } from "@/lib/metrics";

const C = 150, STEP = 20;
const pt = (i: number, level: number) => {
  const a = ((-90 + i * 72) * Math.PI) / 180;
  return [C + Math.cos(a) * level * STEP, C + Math.sin(a) * level * STEP] as const;
};
const poly = (levels: number[]) => levels.map((l, i) => pt(i, l).join(",")).join(" ");

export function SnowflakeFilter({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const mins = SNOWFLAKE_AXES.map((a) => value[a.key] ?? 0);
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[300px]">
      {[1, 2, 3, 4, 5, 6].map((l) => (
        <polygon key={l} points={poly(Array(5).fill(l))} fill="none" stroke="currentColor" strokeOpacity={0.15} />
      ))}
      {SNOWFLAKE_AXES.map((_, i) => (
        <line key={i} x1={C} y1={C} x2={pt(i, 6)[0]} y2={pt(i, 6)[1]} stroke="currentColor" strokeOpacity={0.15} />
      ))}
      <polygon points={poly(mins)} fill="#f5b942" fillOpacity={0.25} stroke="#f5b942" strokeWidth={2} />
      {SNOWFLAKE_AXES.map((a, i) => {
        const [lx, ly] = pt(i, 7.2);
        return (
          <g key={a.key}>
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[10px] font-semibold uppercase opacity-70">
              {a.label}
            </text>
            {[1, 2, 3, 4, 5, 6].map((l) => {
              const [x, y] = pt(i, l);
              const active = mins[i] === l;
              return (
                <circle
                  key={l}
                  cx={x}
                  cy={y}
                  r={active ? 6 : 4}
                  className="cursor-pointer"
                  fill={active ? "#f5b942" : "currentColor"}
                  fillOpacity={active ? 1 : 0.25}
                  onClick={() => onChange({ ...value, [a.key]: active ? 0 : l })}
                >
                  <title>{`${a.label} ≥ ${l}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
