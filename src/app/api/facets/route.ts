import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";

// Distinct countries and sectors currently in the database (for the filter chips).
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let rows: { country: string | null; sector: string | null; has_details?: boolean }[];
  if (url && key) {
    const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).from("stocks").select("country,sector,has_details").limit(20000);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows = data;
  } else {
    rows = mockUniverse().map((r) => ({ ...r, has_details: true }));
  }
  const all = rows.length;
  const tally = (pick: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  const analysed = rows.filter((r) => r.has_details);
  rows = analysed; // chips only offer values that can actually match
  return Response.json({ markets: tally((r) => r.country), industries: tally((r) => r.sector), total: all, analysed: analysed.length });
}
