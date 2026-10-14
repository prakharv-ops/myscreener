import { MAX_AXIS, SNOWFLAKE_AXES } from "@/lib/metrics";
import type { StockRow } from "@/lib/screen";

const S = 44, C = S / 2, R = 19;

/** Tiny per-stock snowflake: one spoke per axis, length = score. Colour follows the average. */
export function MiniSnowflake({ row }: { row: StockRow }) {
  const vals = SNOWFLAKE_AXES.map((a) => (row as unknown as Record<string, number | null>)[a.col] ?? 0);
  const pts = vals.map((v, i) => {
    const a = ((-90 + (i * 360) / vals.length) * Math.PI) / 180;
    const r = (v / MAX_AXIS) * R;
    return `${(C + Math.cos(a) * r).toFixed(1)},${(C + Math.sin(a) * r).toFixed(1)}`;
  });
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const color = avg >= 6 ? "#34d399" : avg >= 4 ? "#f5b942" : "#f87171";
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-label={SNOWFLAKE_AXES.map((a, i) => `${a.label} ${vals[i]}`).join(", ")}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeOpacity={0.15} />
      <circle cx={C} cy={C} r={R / 2} fill="none" stroke="currentColor" strokeOpacity={0.1} />
      <polygon points={pts.join(" ")} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
