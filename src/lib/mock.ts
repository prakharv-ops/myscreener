import type { StockRow } from "./screen";

// Deterministic fake universe so the UI works before Supabase is configured.
// NOT real data. Replace by running `npm run ingest`.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const MARKETS: [string, string, string][] = [
  ["United States", "NasdaqGS", "USD"],
  ["United States", "NYSE", "USD"],
  ["India", "NSEI", "INR"],
  ["United Kingdom", "LSE", "GBP"],
  ["Japan", "TSE", "JPY"],
  ["Germany", "XTRA", "EUR"],
  ["Australia", "ASX", "AUD"],
  ["Canada", "TSX", "CAD"],
];
const SECTORS = ["Technology", "Healthcare", "Financial Services", "Energy", "Industrials", "Consumer Cyclical", "Utilities", "Basic Materials"];

export function mockUniverse(n = 400): StockRow[] {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const sc = () => Math.floor(r() * 7);
  return Array.from({ length: n }, (_, i) => {
    const [country, exchange, currency] = pick(MARKETS);
    const sector = pick(SECTORS);
    const sym = `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}${String.fromCharCode(65 + ((i * 13) % 26))}`;
    const s = [sc(), sc(), sc(), sc(), sc()];
    return {
      symbol: `${sym}${i}`,
      name: `${sector.split(" ")[0]} Corp ${i}`,
      exchange, country, sector, industry: sector, currency,
      price: +(5 + r() * 300).toFixed(2),
      market_cap: Math.round(1e8 * Math.pow(10, r() * 4.5)),
      pe: +(5 + r() * 50).toFixed(1),
      pb: +(0.5 + r() * 10).toFixed(1),
      peg: +(0.3 + r() * 3).toFixed(1),
      eps: +(r() * 12 - 1).toFixed(2),
      roe: +(r() * 40 - 5).toFixed(1),
      roa: +(r() * 15 - 2).toFixed(1),
      debt_to_equity: +(r() * 200).toFixed(0),
      beta: +(0.4 + r() * 1.6).toFixed(2),
      div_yield: +(r() * 6).toFixed(2),
      earnings_growth_past_1y: +(r() * 60 - 20).toFixed(1),
      earnings_growth_past_5y: +(r() * 40 - 10).toFixed(1),
      earnings_growth_est_1y: +(r() * 40 - 10).toFixed(1),
      analyst_target: null,
      analyst_count: Math.floor(r() * 30),
      ret_7d: +(r() * 10 - 5).toFixed(1),
      ret_1y: +(r() * 90 - 30).toFixed(1),
      ret_5y: +(r() * 300 - 50).toFixed(1),
      score_value: s[0], score_future: s[1], score_past: s[2], score_health: s[3], score_dividends: s[4],
      score_total: s.reduce((a, b) => a + b, 0),
      description: `${sector} company listed in ${country}`,
      is_primary_listing: true,
    };
  });
}
