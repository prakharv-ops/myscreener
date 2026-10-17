// Currency -> USD multipliers via Yahoo FX quotes (e.g. EURUSD=X). Minor units (GBp, ZAc, ILA) are /100.
import { MINOR } from "./calc.mjs";
import { yf } from "./yahoo-detail.mjs";

const cache = new Map<string, number>([["USD", 1]]);

export async function loadFx(currencies: Iterable<string | null | undefined>) {
  const want = new Set<string>();
  for (const c of currencies) {
    if (!c) continue;
    const base = MINOR[c]?.[0] ?? c;
    if (!cache.has(base)) want.add(base);
  }
  if (!want.size) return;
  const res = (await yf.quote([...want].map((c) => `${c}USD=X`), {}, { validateResult: false })) as unknown as { symbol: string; regularMarketPrice?: number }[];
  for (const q of res) if (typeof q.regularMarketPrice === "number") cache.set(q.symbol.slice(0, 3), q.regularMarketPrice);
}

/** Multiply an amount in `currency` by this to get USD; null if the rate is unknown. */
export function toUsd(currency: string | null | undefined): number | null {
  if (!currency) return null;
  const [base, factor] = MINOR[currency] ?? [currency, 1];
  const r = cache.get(base);
  return r == null ? null : r * factor;
}

/** For market caps: Yahoo reports caps in the major unit even when the price is in pence/cents (GBp, ZAc, ILA). */
export function capToUsd(currency: string | null | undefined): number | null {
  if (!currency) return null;
  const r = cache.get(MINOR[currency]?.[0] ?? currency);
  return r ?? null;
}
