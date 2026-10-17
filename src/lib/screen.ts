import { z } from "zod";
import { METRICS, SNOWFLAKE_AXES, SORTABLE } from "./metrics";

const metricKeys = METRICS.map((m) => m.key);

export const ScreenSpec = z.object({
  markets: z.array(z.string()).default([]), // countries (as stored in `country`)
  regions: z.array(z.string()).default([]),
  sectors: z.array(z.string()).default([]),
  capSizes: z.array(z.enum(["mega", "large", "mid", "small", "micro"])).default([]), // by USD market cap
  industries: z.array(z.string()).default([]), // Yahoo industries (finer than sectors)
  snowflake: z.record(z.string(), z.number().min(0).max(10)).default({}), // axis -> min score
  metrics: z
    .array(
      z.object({
        key: z.enum(metricKeys as [string, ...string[]]),
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    )
    .default([]),
  keywords: z.string().max(200).default(""),
  includeSecondary: z.boolean().default(false),
  detailedOnly: z.boolean().default(true), // hide stocks that only have market data so far (no sector/scores yet)
  sort: z
    .object({
      key: z.string().refine((k) => SORTABLE.has(k)),
      dir: z.enum(["asc", "desc"]),
    })
    .default({ key: "market_cap", dir: "desc" }),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type ScreenSpec = z.infer<typeof ScreenSpec>;

export const axisCol = (axis: string) => SNOWFLAKE_AXES.find((a) => a.key === axis)?.col;

export interface StockRow {
  symbol: string;
  name: string;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  price: number | null;
  market_cap: number | null;
  pe: number | null;
  pb: number | null;
  peg: number | null;
  eps: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  beta: number | null;
  div_yield: number | null;
  earnings_growth_past_1y: number | null;
  earnings_growth_past_5y: number | null;
  earnings_growth_est_1y: number | null;
  analyst_target: number | null;
  analyst_count: number | null;
  profit_margin: number | null;
  analyst_rating: number | null;
  region: string | null;
  market_cap_usd: number | null;
  forward_pe: number | null;
  ps: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  revenue_growth: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  current_ratio: number | null;
  payout_ratio: number | null;
  insider_pct: number | null;
  institution_pct: number | null;
  short_pct: number | null;
  avg_volume: number | null;
  employees: number | null;
  pct_from_high: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_6m: number | null;
  ret_ytd: number | null;
  ret_7d: number | null;
  ret_1y: number | null;
  ret_5y: number | null;
  score_value: number | null;
  score_future: number | null;
  score_past: number | null;
  score_health: number | null;
  score_dividends: number | null;
  score_momentum: number | null;
  score_quality: number | null;
  score_sentiment: number | null;
  score_total: number | null;
  description?: string | null;
  has_details?: boolean;
  is_primary_listing?: boolean | null;
}

export interface ScreenResult {
  count: number;
  rows: StockRow[];
  source: "supabase" | "mock";
}
