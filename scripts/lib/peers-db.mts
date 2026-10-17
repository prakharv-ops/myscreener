// Load peer statistics (for sector-relative scoring) from the analysed, primary listings in Supabase.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPeerStats, PEER_COLUMNS, type PeerRow, type PeerStats } from "../../src/lib/peers";

export async function loadPeerStats(sb: SupabaseClient): Promise<PeerStats> {
  const rows: PeerRow[] = [];
  const cols = ["symbol", "industry", "sector", ...PEER_COLUMNS].join(",");
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("stocks").select(cols).eq("has_details", true).eq("is_primary_listing", true)
      .order("symbol").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as unknown as PeerRow[]));
    if (data.length < 1000) break;
  }
  return buildPeerStats(rows);
}
