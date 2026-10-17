// Usage: npm run global [-- --max 20000]
// Adds the largest non-US companies per country (Yahoo's equity screener, sorted by market cap) until the
// whole universe (US included) reaches --max rows. Quotas below decide how the remaining room is spread;
// they roughly follow each market's share of global listed companies above ~$100m.
// Existing rows are never overwritten; new ones get market data straight from the screener response.
import { createClient } from "@supabase/supabase-js";
import { regionOf } from "../src/lib/regions";
import { loadFx, toUsd } from "./lib/fx.mjs";
import { num, withRetry, yf } from "./lib/yahoo-detail.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = Boolean(process.env.DRY_RUN);
if (!DRY && (!url || !key)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false } });

const arg = (n: string, d: number) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const MAX = arg("max", Number(process.env.UNIVERSE_MAX ?? 20000));

// Yahoo region code -> [country name as Yahoo's assetProfile spells it, quota]
const MARKETS: Record<string, [string, number]> = {
  jp: ["Japan", 2400], in: ["India", 2200], cn: ["China", 1600], kr: ["South Korea", 1100], hk: ["Hong Kong", 1000],
  tw: ["Taiwan", 900], gb: ["United Kingdom", 900], ca: ["Canada", 800], au: ["Australia", 700], de: ["Germany", 450],
  fr: ["France", 400], se: ["Sweden", 350], ch: ["Switzerland", 220], it: ["Italy", 250], es: ["Spain", 130],
  nl: ["Netherlands", 110], no: ["Norway", 180], dk: ["Denmark", 120], fi: ["Finland", 110], be: ["Belgium", 90],
  at: ["Austria", 50], ie: ["Ireland", 40], pt: ["Portugal", 35], pl: ["Poland", 180], gr: ["Greece", 70],
  il: ["Israel", 220], tr: ["Turkey", 250], sa: ["Saudi Arabia", 200], ae: ["United Arab Emirates", 80], qa: ["Qatar", 45],
  za: ["South Africa", 180], eg: ["Egypt", 60], br: ["Brazil", 280], mx: ["Mexico", 90], cl: ["Chile", 60],
  sg: ["Singapore", 220], my: ["Malaysia", 300], th: ["Thailand", 300], id: ["Indonesia", 300], ph: ["Philippines", 100],
  vn: ["Vietnam", 200], nz: ["New Zealand", 80],
};

interface Q {
  symbol: string; quoteType?: string; longName?: string; shortName?: string; fullExchangeName?: string; currency?: string;
  regularMarketPrice?: number; marketCap?: number; trailingPE?: number; priceToBook?: number; epsTrailingTwelveMonths?: number;
  dividendYield?: number; fiftyTwoWeekChangePercent?: number; averageAnalystRating?: string;
}

async function screen(region: string, offset: number, size: number): Promise<{ total: number; quotes: Q[] }> {
  const body = {
    size, offset, sortField: "intradaymarketcap", sortType: "DESC", quoteType: "EQUITY",
    query: { operator: "AND", operands: [{ operator: "eq", operands: ["region", region] }, { operator: "gt", operands: ["intradaymarketcap", 0] }] },
  };
  // _fetch is the library's internal fetch: it handles Yahoo's cookie/crumb dance for us
  const j = await (yf as unknown as { _fetch: (...a: unknown[]) => Promise<{ finance?: { result?: { total: number; quotes: Q[] }[] } }> })._fetch(
    "https://query2.finance.yahoo.com/v1/finance/screener",
    { lang: "en-US", region: "US", formatted: "false" },
    { fetchOptions: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } },
    "json",
    true,
  );
  const r = j?.finance?.result?.[0];
  return { total: r?.total ?? 0, quotes: r?.quotes ?? [] };
}

// The library reuses our POST options for its cookie/crumb requests, which Yahoo rejects; a plain GET first
// gets the crumb cached so the screener POSTs reuse it.
await yf.quote("AAPL");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(limited|ltd|plc|inc|corp|corporation|co|ag|sa|nv|se|asa|ab|oyj|spa|tbk|bhd|berhad|pcl|holdings?)$/g, "");

const { count: existing, error: cErr } = DRY ? { count: 6000, error: null } : await sb.from("stocks").select("symbol", { count: "exact", head: true });
if (cErr) throw cErr;
let room = MAX - (existing ?? 0);
console.log(`universe has ${existing}; room for ${room} more (max ${MAX})`);
if (room <= 0) process.exit(0);

// scale quotas down if they exceed the room
const quotaSum = Object.values(MARKETS).reduce((a, [, q]) => a + q, 0);
const scale = Math.min(1, room / quotaSum);

let added = 0;
for (const [region, [country, quota]] of Object.entries(MARKETS)) {
  const want = Math.floor(quota * scale);
  const picked: Q[] = [];
  const seenNames = new Set<string>();
  try {
    for (let offset = 0; picked.length < want; offset += 250) {
      const { total, quotes } = await withRetry(() => screen(region, offset, 250));
      for (const q of quotes) {
        if (picked.length >= want) break;
        if (q.quoteType && q.quoteType !== "EQUITY") continue;
        if (num(q.regularMarketPrice) == null || !q.marketCap) continue;
        const n = norm(q.longName ?? q.shortName ?? q.symbol);
        if (seenNames.has(n)) continue; // e.g. the same Indian company on NSE (.NS) and BSE (.BO)
        seenNames.add(n);
        picked.push(q);
      }
      if (offset + 250 >= total || !quotes.length) break;
    }
  } catch (e) {
    console.warn(`${region}: ${(e as Error).message.slice(0, 100)}`);
    continue;
  }

  await loadFx(picked.map((q) => q.currency));
  const rows = picked.map((q) => ({
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    exchange: q.fullExchangeName ?? null,
    country,
    region: regionOf(country),
    currency: q.currency ?? null,
    price: num(q.regularMarketPrice),
    market_cap: num(q.marketCap),
    market_cap_usd: toUsd(q.currency) != null ? Math.round(q.marketCap! * toUsd(q.currency)!) : null,
    pe: num(q.trailingPE),
    pb: ["GBp", "ZAc", "ILA"].includes(q.currency ?? "") ? null : num(q.priceToBook),
    eps: num(q.epsTrailingTwelveMonths),
    div_yield: num(q.dividendYield),
    ret_1y: num(q.fiftyTwoWeekChangePercent),
    analyst_rating: q.averageAnalystRating ? num(parseFloat(q.averageAnalystRating)) : null,
  }));

  let inserted = 0;
  if (DRY) {
    inserted = rows.length;
    console.log(`  e.g. ${rows.slice(0, 3).map((r) => `${r.symbol} ${r.name} $${((r.market_cap_usd ?? 0) / 1e9).toFixed(1)}b`).join(" | ")}`);
  } else {
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await sb.from("stocks").upsert(rows.slice(i, i + 500), { onConflict: "symbol", ignoreDuplicates: true }).select("symbol");
      if (error) throw error;
      inserted += data?.length ?? 0;
    }
  }
  added += inserted;
  const smallest = rows.at(-1)?.market_cap_usd;
  console.log(`${region} ${country}: ${inserted} new of ${rows.length} (smallest ~$${smallest ? (smallest / 1e6).toFixed(0) + "m" : "?"})`);
}
console.log(`added ${added}; universe now ~${(existing ?? 0) + added}`);
