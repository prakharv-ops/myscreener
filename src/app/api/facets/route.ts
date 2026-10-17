import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";

interface Row { country: string | null; sector: string | null }

// Distinct countries and sectors among fully analysed stocks (for the filter chips) + coverage counts.
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let rows: Row[] = [];
  let total: number;

  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const all = await sb.from("stocks").select("symbol", { count: "exact", head: true });
    if (all.error) return Response.json({ error: all.error.message }, { status: 500 });
    total = all.count ?? 0;
    // PostgREST returns at most 1000 rows per request, so page through
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("stocks").select("country,sector").eq("has_details", true).order("symbol").range(from, from + 999);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      rows.push(...(data as Row[]));
      if (data.length < 1000) break;
    }
  } else {
    rows = mockUniverse();
    total = rows.length;
  }

  const tally = (pick: (r: Row) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  return Response.json({ markets: tally((r) => r.country), industries: tally((r) => r.sector), total, analysed: rows.length });
}
