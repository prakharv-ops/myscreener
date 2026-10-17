import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";

// GET /api/stock/AAPL -> full row (incl. business description) for the detail panel
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const row = mockUniverse().find((r) => r.symbol === symbol);
    return row ? Response.json(row) : Response.json({ error: "not found" }, { status: 404 });
  }
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } })
    .from("stocks").select("*").eq("symbol", symbol).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  const { fts: _fts, ...row } = data as Record<string, unknown>;
  return Response.json(row);
}
