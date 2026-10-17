import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";

type Kind = "region" | "country" | "sector" | "industry";
interface Facet { name: string; count: number }

// Filter-chip values among fully analysed stocks, plus coverage counts. Backed by the `stock_facets` view.
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out: Record<Kind, Facet[]> = { region: [], country: [], sector: [], industry: [] };
  let total: number, analysed: number;

  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const [all, done, facets] = await Promise.all([
      sb.from("stocks").select("symbol", { count: "exact", head: true }),
      sb.from("stocks").select("symbol", { count: "exact", head: true }).eq("has_details", true),
      sb.from("stock_facets").select("kind,name,n").range(0, 4999),
    ]);
    const err = all.error ?? done.error ?? facets.error;
    if (err) return Response.json({ error: err.message }, { status: 500 });
    total = all.count ?? 0;
    analysed = done.count ?? 0;
    for (const f of facets.data as { kind: Kind; name: string; n: number }[]) out[f.kind]?.push({ name: f.name, count: f.n });
  } else {
    const rows = mockUniverse();
    total = analysed = rows.length;
    for (const kind of Object.keys(out) as Kind[]) {
      const m = new Map<string, number>();
      for (const r of rows) { const v = r[kind]; if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      out[kind] = [...m].map(([name, count]) => ({ name, count }));
    }
  }
  for (const k of Object.keys(out) as Kind[]) out[k].sort((a, b) => b.count - a.count);
  return Response.json({ regions: out.region, markets: out.country, sectors: out.sector, industries: out.industry, total, analysed });
}
