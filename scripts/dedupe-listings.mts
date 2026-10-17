// Usage: npm run dedupe
// One company can appear several times: share classes (GOOGL/GOOG), US ADRs next to the home listing
// (TSM / 2330.TW), Canadian Depositary Receipts (AMZN.TO). Group rows by normalised company name and mark
// all but one as secondary (is_primary_listing = false); the screener hides secondary listings by default.
// Preference: home-market listing > most traded (avg volume x price, in USD terms via market cap) > shortest symbol.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DRY = Boolean(process.env.DRY_RUN);

const SUFFIX_COUNTRY: Record<string, string> = {
  NS: "India", BO: "India", T: "Japan", SS: "China", SZ: "China", HK: "Hong Kong", KS: "South Korea", KQ: "South Korea",
  TW: "Taiwan", TWO: "Taiwan", L: "United Kingdom", TO: "Canada", V: "Canada", AX: "Australia", PA: "France", AS: "Netherlands",
  BR: "Belgium", LS: "Portugal", MI: "Italy", OL: "Norway", IR: "Ireland", DE: "Germany", SW: "Switzerland", SI: "Singapore",
};
const listingCountry = (sym: string) => {
  const m = sym.match(/\.([A-Z]+)$/);
  return m ? (SUFFIX_COUNTRY[m[1]] ?? "?") : "United States";
};
const STOP = /\b(the|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|ag|nv|se|asa|ab|oyj|spa|tbk|bhd|berhad|pcl|kk|class [a-z]|series [a-z]|adr|ads|cdr|cad hedged|ordinary shares?|common stock)\b/g;
const norm = (s: string) => s.toLowerCase().replace(/[.,'’&()\-/]/g, " ").replace(STOP, " ").replace(/\s+/g, "").trim();

interface Row { symbol: string; name: string; country: string | null; market_cap_usd: number | null; avg_volume: number | null; price: number | null; is_primary_listing: boolean }
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("symbol,name,country,market_cap_usd,avg_volume,price,is_primary_listing").order("symbol").range(from, from + 999);
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
  const score = (r: Row) => [
    r.country && listingCountry(r.symbol) === r.country ? 1 : 0, // listed in its home market
    (r.avg_volume ?? 0) * (r.price ?? 0) > 0 ? Math.log10((r.avg_volume ?? 0) * (r.price ?? 0) + 1) : 0, // (local) traded value
    -r.symbol.length,
  ];
  const best = [...g].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return a.symbol.localeCompare(b.symbol);
  })[0];
  for (const r of g) (r === best ? primary : secondary).add(r.symbol);
  if (examples.length < 12) examples.push(`${best.symbol} keeps; hides ${g.filter((r) => r !== best).map((r) => r.symbol).join(", ")}`);
}
for (const r of rows) if (!primary.has(r.symbol) && !secondary.has(r.symbol)) primary.add(r.symbol);

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
