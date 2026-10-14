// Usage: npm run universe
// Loads every US-listed common stock / ADR from Nasdaq Trader's free official symbol directory
// (Nasdaq, NYSE, NYSE American; no ETFs, test issues, warrants, units, rights or preferreds).
// Existing rows are left untouched; new ones are inserted with name/exchange only.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.DRY_RUN && (!url || !key)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false } });

const BASE = "https://www.nasdaqtrader.com/dynamic/SymDir";
const EXCHANGES: Record<string, string> = { N: "NYSE", A: "NYSE American" }; // otherlisted: P (Arca), Z (BZX), V (IEX) are almost all ETFs
const JUNK = /\b(warrants?|rights?|units?|preferred|pref\b|notes? due|debentures?|subordinated|trust preferred|depositary shares? each representing .*(preferred|interest in))\b|\d+(\.\d+)?%|\bseries [a-z]\b.*\bshares?\b/i;

async function table(file: string) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const [head, ...lines] = (await res.text()).split(/\r?\n/).filter(Boolean);
  const cols = head.split("|");
  return lines
    .filter((l) => !l.startsWith("File Creation Time"))
    .map((l) => Object.fromEntries(l.split("|").map((v, i) => [cols[i], v.trim()])));
}

const clean = (name: string) => name.replace(/\s+-\s+(Common Stock|Class [A-Z] .*|Ordinary Shares?.*|American Depositary Shares?.*)$/i, "").replace(/\s+(Common Stock|Ordinary Shares?)$/i, "").trim();
const yahooSymbol = (s: string) => s.replace(/[./]/g, "-");

interface Row { symbol: string; name: string; exchange: string; country: string; currency: string }
const out = new Map<string, Row>();

for (const r of await table("nasdaqlisted.txt")) {
  if (r["Test Issue"] === "Y" || r["ETF"] === "Y") continue;
  out.set(yahooSymbol(r["Symbol"]), { symbol: yahooSymbol(r["Symbol"]), name: r["Security Name"], exchange: "NASDAQ", country: "United States", currency: "USD" });
}
for (const r of await table("otherlisted.txt")) {
  const ex = EXCHANGES[r["Exchange"]];
  if (!ex || r["Test Issue"] === "Y" || r["ETF"] === "Y") continue;
  const sym = yahooSymbol(r["ACT Symbol"]);
  out.set(sym, { symbol: sym, name: r["Security Name"], exchange: ex, country: "United States", currency: "USD" });
}

const rows = [...out.values()]
  .filter((r) => !r.symbol.includes("$") && !JUNK.test(r.name) && /^[A-Z]{1,5}(-[A-Z])?$/.test(r.symbol))
  .map((r) => ({ ...r, name: clean(r.name) }));
console.log(`${out.size} listed, ${rows.length} kept after filtering`);

if (process.env.DRY_RUN) {
  console.log("sample:", rows.slice(0, 5).map((r) => `${r.symbol} ${r.name}`));
  console.log("dropped sample:", [...out.values()].filter((r) => !rows.some((k) => k.symbol === r.symbol)).slice(0, 12).map((r) => `${r.symbol} ${r.name}`));
  process.exit(0);
}
let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  // ignoreDuplicates: never overwrite rows that already have details
  const { data, error } = await sb.from("stocks").upsert(rows.slice(i, i + 500), { onConflict: "symbol", ignoreDuplicates: true }).select("symbol");
  if (error) throw error;
  inserted += data?.length ?? 0;
}
console.log(`inserted ${inserted} new, ${rows.length - inserted} already present`);
