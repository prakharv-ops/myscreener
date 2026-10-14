import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";

// Distinct countries and sectors currently in the database (for the filter chips).
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let rows: { country: string | null; sector: string | null }[];
  if (url && key) {
    const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).from("stocks").select("country,sector").limit(20000);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows = data;
  } else {
    rows = mockUniverse();
  }
  const tally = (pick: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  return Response.json({ markets: tally((r) => r.country), industries: tally((r) => r.sector) });
}
