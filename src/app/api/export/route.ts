import { METRICS, SNOWFLAKE_AXES } from "@/lib/metrics";
import { allMatches } from "@/lib/run-screen";
import { ScreenSpec } from "@/lib/screen";

const COLS = ["symbol", "name", "exchange", "country", "region", "sector", "industry", "currency", ...METRICS.map((m) => m.key), ...SNOWFLAKE_AXES.map((a) => a.col), "score_total"];
const esc = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// POST <ScreenSpec> -> CSV of every match (capped at 5,000 rows)
export async function POST(request: Request) {
  const parsed = ScreenSpec.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const rows = await allMatches(parsed.data, 5000);
    const lines = [COLS.join(","), ...rows.map((r) => COLS.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(","))];
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
