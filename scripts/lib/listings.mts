// Pure helpers for spotting duplicate listings of one company and fund-like securities (used by dedupe-listings).

export interface ListingRow {
  symbol: string;
  name: string;
  country: string | null;
  industry: string | null;
  avg_volume: number | null;
  price: number | null;
}

const SUFFIX_COUNTRY: Record<string, string> = {
  NS: "India", BO: "India", T: "Japan", SS: "China", SZ: "China", HK: "Hong Kong", KS: "South Korea", KQ: "South Korea",
  TW: "Taiwan", TWO: "Taiwan", L: "United Kingdom", TO: "Canada", V: "Canada", AX: "Australia", PA: "France", AS: "Netherlands",
  BR: "Belgium", LS: "Portugal", MI: "Italy", OL: "Norway", IR: "Ireland", DE: "Germany", SW: "Switzerland", SI: "Singapore",
};

/** Country of the exchange a Yahoo symbol trades on (no suffix = US). */
export const listingCountry = (sym: string) => {
  const m = sym.match(/\.([A-Z]+)$/);
  return m ? (SUFFIX_COUNTRY[m[1]] ?? "?") : "United States";
};

// Legal-form and share-class words that differ between listings of the same company.
// Deliberately NOT stripped: "holdings"/"group" (a holding company is a different company from its operating arm).
const STOP = /\b(the|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|ag|nv|se|asa|ab|oyj|spa|tbk|bhd|berhad|pcl|kk|class [a-z]|series [a-z]|adr|ads|cdr|cad hedged|ordinary shares?|common stock)\b/g;

/** Company-name key used to group listings of the same company. */
export const normName = (s: string) => s.toLowerCase().replace(/[.,'’&()\-/]/g, " ").replace(STOP, " ").replace(/\s+/g, "").trim();

/** Closed-end funds, unit/physical-metal trusts, investment trusts and SPAC shells: hidden by default. */
export const isFundLike = (r: Pick<ListingRow, "name" | "industry">) =>
  r.industry === "Shell Companies" ||
  /\b(fund|etf|etn|closed[- ]end)\b/i.test(r.name) ||
  /\b(physical (gold|silver|platinum|palladium|uranium|metals?)|investment trust)\b/i.test(r.name) ||
  (r.industry === "Asset Management" && /\b(trust|portfolio|income shares|capital shares)\b/i.test(r.name) && !/\b(corp|corporation|bank|bancorp|company|financial|group|holdings?)\b/i.test(r.name));

/** Which listing to keep: home-market listing > most traded (local traded value) > shortest symbol > alphabetical. */
export function pickPrimary<T extends ListingRow>(group: T[]): T {
  const score = (r: T) => [
    r.country && listingCountry(r.symbol) === r.country ? 1 : 0,
    (r.avg_volume ?? 0) * (r.price ?? 0) > 0 ? Math.log10((r.avg_volume ?? 0) * (r.price ?? 0) + 1) : 0,
    -r.symbol.length,
  ];
  return [...group].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return a.symbol.localeCompare(b.symbol);
  })[0];
}
