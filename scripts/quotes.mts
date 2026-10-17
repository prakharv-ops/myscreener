// Usage: npm run quotes
// Fast pass over EVERY row in `stocks`: Yahoo's batch quote endpoint (100 symbols/call) refreshes
// price, market cap, PE, P/B, EPS, dividend yield, 1Y return and analyst rating.
import { createClient } from "@supabase/supabase-js";
import { capToUsd, loadFx } from "./lib/fx.mjs";
import { yf, num } from "./lib/yahoo-detail.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const symbols: string[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("symbol").order("symbol").range(from, from + 999);
  if (error) throw error;
  symbols.push(...data.map((r) => r.symbol));
  if (data.length < 1000) break;
}
console.log(`quoting ${symbols.length} symbols`);

interface Q {
  symbol: string; longName?: string; shortName?: string; fullExchangeName?: string; currency?: string;
  regularMarketPrice?: number; marketCap?: number; trailingPE?: number; priceToBook?: number;
  epsTrailingTwelveMonths?: number; dividendYield?: number; fiftyTwoWeekChangePercent?: number; averageAnalystRating?: string;
}
const MINOR = ["GBp", "ZAc", "ILA"];

let done = 0, updated = 0, missing = 0;
const chunks: string[][] = [];
for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));

async function worker() {
  for (let c = chunks.shift(); c; c = chunks.shift()) {
    try {
      const res = (await yf.quote(c, {}, { validateResult: false })) as unknown as Q[];
      await loadFx(res.map((q) => q.currency));
      const rows = res
        .filter((q) => num(q.regularMarketPrice) != null)
        .map((q) => ({
          market_cap_usd: num(q.marketCap) != null && capToUsd(q.currency) != null ? Math.round(q.marketCap! * capToUsd(q.currency)!) : null,
          symbol: q.symbol,
          name: q.longName ?? q.shortName ?? q.symbol,
          exchange: q.fullExchangeName ?? null,
          currency: q.currency ?? null,
          price: num(q.regularMarketPrice),
          market_cap: num(q.marketCap),
          pe: num(q.trailingPE),
          pb: MINOR.includes(q.currency ?? "") ? null : num(q.priceToBook),
          eps: num(q.epsTrailingTwelveMonths),
          div_yield: num(q.dividendYield),
          ret_1y: num(q.fiftyTwoWeekChangePercent),
          analyst_rating: q.averageAnalystRating ? num(parseFloat(q.averageAnalystRating)) : null,
          updated_at: new Date().toISOString(),
        }));
      missing += c.length - rows.length;
      if (rows.length) {
        const { error } = await sb.from("stocks").upsert(rows, { onConflict: "symbol" });
        if (error) throw error;
        updated += rows.length;
      }
    } catch (e) {
      console.warn("batch failed:", (e as Error).message.slice(0, 120));
    }
    done += c.length;
    if (done % 1000 < 100) console.log(`  ${done}/${symbols.length}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`updated ${updated}, no quote for ${missing}`);
