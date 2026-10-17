// Usage: npm run dedupe
// One company can appear several times: share classes (GOOGL/GOOG), US ADRs next to the home listing
// (TSM / 2330.TW), Canadian Depositary Receipts (AMZN.TO). Group rows by normalised company name and mark
// all but one as secondary (is_primary_listing = false); the screener hides secondary listings by default.
// Preference: home-market listing > most traded (avg volume x price, in USD terms via market cap) > shortest symbol.
// Also hidden by default: closed-end funds / unit trusts (the exchange lists exclude ETFs but not these) and SPAC shells.
import { createClient } from "@supabase/supabase-js";
import { isFundLike, normName as norm, pickPrimary } from "./lib/listings.mjs";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DRY = Boolean(process.env.DRY_RUN);

interface Row { symbol: string; name: string; country: string | null; industry: string | null; market_cap_usd: number | null; avg_volume: number | null; price: number | null; is_primary_listing: boolean }

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("symbol,name,country,industry,market_cap_usd,avg_volume,price,is_primary_listing").order("symbol").range(from, from + 999);
  if (error) throw error;
  rows.push(...(data as Row[]));
  if (data.length < 1000) break;
}

const groups = new Map<string, Row[]>();
for (const r of rows) {
  const k = norm(r.name);
  if (k.length < 3) continue; // too generic to group safely
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
}

const primary = new Set<string>(), secondary = new Set<string>();
const examples: string[] = [];
for (const g of groups.values()) {
  if (g.length === 1) { primary.add(g[0].symbol); continue; }
  const best = pickPrimary(g);
  for (const r of g) (r === best ? primary : secondary).add(r.symbol);
  if (examples.length < 12) examples.push(`${best.symbol} keeps; hides ${g.filter((r) => r !== best).map((r) => r.symbol).join(", ")}`);
}
for (const r of rows) if (!primary.has(r.symbol) && !secondary.has(r.symbol)) primary.add(r.symbol);
const funds = rows.filter(isFundLike);
for (const r of funds) { primary.delete(r.symbol); secondary.add(r.symbol); }
console.log(`${funds.length} funds / trusts / shells hidden, e.g. ${funds.slice(0, 8).map((r) => r.symbol).join(", ")}`);

const toSecondary = rows.filter((r) => secondary.has(r.symbol) && r.is_primary_listing !== false).map((r) => r.symbol);
const toPrimary = rows.filter((r) => primary.has(r.symbol) && r.is_primary_listing === false).map((r) => r.symbol);
console.log(`${rows.length} rows, ${secondary.size} secondary listings (${toSecondary.length} newly hidden, ${toPrimary.length} restored)`);
examples.forEach((e) => console.log("  " + e));
if (DRY) process.exit(0);

for (const [ids, value] of [[toSecondary, false], [toPrimary, true]] as const) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from("stocks").update({ is_primary_listing: value }).in("symbol", ids.slice(i, i + 200));
    if (error) throw error;
  }
}
console.log("done");
