import { createClient } from "@supabase/supabase-js";
import { fetchDetail, yf } from "./lib/yahoo-detail.mjs";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await sb.from("stocks").select("symbol").eq("has_details", false).gte("detail_failures", 1).order("market_cap_usd", { ascending: false, nullsFirst: false }).limit(12);
for (const { symbol } of data!) {
  try { const r = await fetchDetail(symbol); console.log("OK  ", symbol, r.sector, r.industry); }
  catch (e) {
    // find which sub-call fails
    let which = "";
    try { await yf.quoteSummary(symbol, { modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] }); } catch (e2) { which = `quoteSummary: ${String((e2 as Error).message).slice(0, 140)}`; }
    console.log("FAIL", symbol, String((e as Error).message).slice(0, 120), "|", which);
  }
}
