// Peer statistics for sector-relative scoring. A stock's industry-sensitive metrics (valuation multiples, margins,
// returns on capital, leverage) are ranked against its industry; if the industry has too few comparable stocks,
// against its sector, then the whole market. Built from the analysed, primary listings; pure (no I/O).

export type PeerMetric =
  | "pe" | "pb" | "ps" | "ev_ebitda" | "fcf_yield"
  | "roe" | "roa" | "profit_margin" | "gross_margin" | "operating_margin"
  | "debt_to_equity" | "current_ratio";

/** lower-is-better metrics; for valuation multiples only positive values are comparable */
export const PEER_METRICS: Record<PeerMetric, { lowerIsBetter: boolean; positiveOnly: boolean }> = {
  pe: { lowerIsBetter: true, positiveOnly: true },
  pb: { lowerIsBetter: true, positiveOnly: true },
  ps: { lowerIsBetter: true, positiveOnly: true },
  ev_ebitda: { lowerIsBetter: true, positiveOnly: true },
  fcf_yield: { lowerIsBetter: false, positiveOnly: false },
  roe: { lowerIsBetter: false, positiveOnly: false },
  roa: { lowerIsBetter: false, positiveOnly: false },
  profit_margin: { lowerIsBetter: false, positiveOnly: false },
  gross_margin: { lowerIsBetter: false, positiveOnly: false },
  operating_margin: { lowerIsBetter: false, positiveOnly: false },
  debt_to_equity: { lowerIsBetter: true, positiveOnly: false },
  current_ratio: { lowerIsBetter: false, positiveOnly: false },
};
export const PEER_COLUMNS = Object.keys(PEER_METRICS) as PeerMetric[];

/** Fewest comparable stocks a group needs before we trust its distribution. */
export const MIN_PEERS = 15;

/** Any row with industry/sector and (some of) the peer metric columns. */
export interface PeerRow {
  industry?: string | null;
  sector?: string | null;
}
const get = (r: PeerRow, m: PeerMetric) => (r as Record<string, unknown>)[m];

type Dist = Record<PeerMetric, number[]>; // sorted ascending
export interface PeerStats {
  industry: Map<string, Dist>;
  sector: Map<string, Dist>;
  market: Dist;
}

const ok = (m: PeerMetric, v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && (!PEER_METRICS[m].positiveOnly || v > 0);

const emptyDist = (): Dist => Object.fromEntries(PEER_COLUMNS.map((m) => [m, [] as number[]])) as Dist;

export function buildPeerStats(rows: PeerRow[]): PeerStats {
  const industry = new Map<string, Dist>(), sector = new Map<string, Dist>(), market = emptyDist();
  const add = (map: Map<string, Dist>, key: string | null | undefined, m: PeerMetric, v: number) => {
    if (!key) return;
    let d = map.get(key);
    if (!d) map.set(key, (d = emptyDist()));
    d[m].push(v);
  };
  for (const r of rows) {
    for (const m of PEER_COLUMNS) {
      const v = get(r, m);
      if (!ok(m, v)) continue;
      add(industry, r.industry, m, v);
      add(sector, r.sector, m, v);
      market[m].push(v);
    }
  }
  const sortAll = (d: Dist) => { for (const m of PEER_COLUMNS) d[m].sort((a, b) => a - b); };
  industry.forEach(sortAll); sector.forEach(sortAll); sortAll(market);
  return { industry, sector, market };
}

/** count of values < v and == v in a sorted array (binary search) */
function rank(sorted: number[], v: number) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
  let eq = lo;
  while (eq < sorted.length && sorted[eq] === v) eq++;
  return { below: lo, equal: eq - lo };
}
const median = (s: number[]) => (s.length ? (s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null);

export interface PeerResult {
  /** 0..1, 1 = better than every peer (direction already applied) */
  score: number;
  group: "industry" | "sector" | "market";
  groupName: string;
  n: number;
  median: number | null;
}

/** Where does this stock's metric sit among its peers? null when the value isn't comparable or no peers exist. */
export function peerScore(stats: PeerStats | undefined, row: PeerRow, m: PeerMetric): PeerResult | null {
  const v = get(row, m);
  if (!stats || !ok(m, v)) return null;
  const ind = row.industry ? stats.industry.get(row.industry)?.[m] : undefined;
  const sec = row.sector ? stats.sector.get(row.sector)?.[m] : undefined;
  const [group, groupName, dist] =
    ind && ind.length >= MIN_PEERS ? (["industry", row.industry!, ind] as const)
    : sec && sec.length >= MIN_PEERS ? (["sector", row.sector!, sec] as const)
    : (["market", "all stocks", stats.market[m]] as const);
  if (dist.length < 2) return null;
  const { below, equal } = rank(dist, v);
  const pct = (below + equal / 2) / dist.length; // mid-rank percentile: ties share the middle
  return { score: PEER_METRICS[m].lowerIsBetter ? 1 - pct : pct, group, groupName, n: dist.length, median: median(dist) };
}
