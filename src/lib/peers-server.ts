// Server-side peer statistics for the "Why this score?" panel, built from the same rows as the nightly rescore
// (analysed, primary listings) and cached for an hour.
import { createClient } from "@supabase/supabase-js";
import { buildPeerStats, PEER_COLUMNS, type PeerRow, type PeerStats } from "./peers";

const TTL = 60 * 60_000;
let cached: { at: number; stats: PeerStats } | null = null;
let inflight: Promise<PeerStats> | null = null;

export async function getPeerStats(rowsIfMock?: PeerRow[]): Promise<PeerStats> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return buildPeerStats(rowsIfMock ?? []);
  if (cached && Date.now() - cached.at < TTL) return cached.stats;
  inflight ??= (async () => {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const cols = ["symbol", "industry", "sector", ...PEER_COLUMNS].join(",");
    const base = () => sb.from("stocks").select(cols).eq("has_details", true).eq("is_primary_listing", true);
    const { count, error: cErr } = await sb.from("stocks").select("symbol", { count: "exact", head: true }).eq("has_details", true).eq("is_primary_listing", true);
    if (cErr) throw new Error(cErr.message);
    // PostgREST caps responses at 1000 rows: fetch all pages in parallel
    const pages = await Promise.all(Array.from({ length: Math.ceil((count ?? 0) / 1000) }, (_, i) =>
      base().order("symbol").range(i * 1000, i * 1000 + 999).then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as unknown as PeerRow[];
      })));
    const stats = buildPeerStats(pages.flat());
    cached = { at: Date.now(), stats };
    return stats;
  })().finally(() => { inflight = null; });
  return inflight;
}
