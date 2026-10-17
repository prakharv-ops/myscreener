import { createClient } from "@supabase/supabase-js";
import { mockUniverse } from "@/lib/mock";
import { getPeerStats } from "@/lib/peers-server";
import { explainAll } from "@/lib/scoring";

// GET /api/stock/AAPL -> full row (incl. business description) + the score explanation, computed with the same
// peer statistics the nightly rescore uses, so the "why" matches the stored scores.
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const all = mockUniverse();
    const row = all.find((r) => r.symbol === symbol);
    if (!row) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ...row, explain: explainAll(row, await getPeerStats(all)) });
  }
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } })
    .from("stocks").select("*").eq("symbol", symbol).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  const { fts: _fts, ...row } = data as Record<string, unknown>;
  let explain = null;
  try { explain = explainAll(row, await getPeerStats()); } catch { /* panel falls back to absolute-only checks */ }
  return Response.json({ ...row, explain });
}
