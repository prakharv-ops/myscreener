export type Fmt = "num" | "pct" | "usd" | "ratio";

export interface MetricDef {
  key: string; // column in `stocks`
  label: string;
  fmt: Fmt;
  group: string;
}

const g = (group: string, defs: Omit<MetricDef, "group">[]) => defs.map((d) => ({ ...d, group }));

export const METRICS: MetricDef[] = [
  ...g("Size & trading", [
    { key: "market_cap_usd", label: "Market Cap (USD)", fmt: "usd" },
    { key: "market_cap", label: "Market Cap (local currency)", fmt: "usd" },
    { key: "price", label: "Share Price", fmt: "num" },
    { key: "avg_volume", label: "Avg Daily Volume", fmt: "num" },
    { key: "employees", label: "Employees", fmt: "num" },
  ]),
  ...g("Valuation", [
    { key: "pe", label: "PE Ratio", fmt: "ratio" },
    { key: "forward_pe", label: "Forward PE", fmt: "ratio" },
    { key: "peg", label: "PEG Ratio", fmt: "ratio" },
    { key: "pb", label: "PB Ratio", fmt: "ratio" },
    { key: "ps", label: "Price / Sales", fmt: "ratio" },
    { key: "ev_ebitda", label: "EV / EBITDA", fmt: "ratio" },
    { key: "fcf_yield", label: "Free Cash Flow Yield (%)", fmt: "pct" },
  ]),
  ...g("Growth", [
    { key: "revenue_growth", label: "Revenue Growth YoY (%)", fmt: "pct" },
    { key: "earnings_growth_est_1y", label: "1Y Earnings Growth Estimate (%)", fmt: "pct" },
    { key: "earnings_growth_past_1y", label: "Past 1Y Earnings Growth (%)", fmt: "pct" },
    { key: "earnings_growth_past_5y", label: "Past 5Y EPS Growth p.a. (%)", fmt: "pct" },
    { key: "eps", label: "EPS", fmt: "num" },
  ]),
  ...g("Profitability", [
    { key: "roe", label: "ROE (%)", fmt: "pct" },
    { key: "roa", label: "ROA (%)", fmt: "pct" },
    { key: "gross_margin", label: "Gross Margin (%)", fmt: "pct" },
    { key: "operating_margin", label: "Operating Margin (%)", fmt: "pct" },
    { key: "profit_margin", label: "Net Profit Margin (%)", fmt: "pct" },
  ]),
  ...g("Financial health", [
    { key: "debt_to_equity", label: "Debt to Equity (%)", fmt: "pct" },
    { key: "current_ratio", label: "Current Ratio", fmt: "ratio" },
    { key: "beta", label: "Beta", fmt: "ratio" },
  ]),
  ...g("Dividends", [
    { key: "div_yield", label: "Dividend Yield (%)", fmt: "pct" },
    { key: "payout_ratio", label: "Payout Ratio (%)", fmt: "pct" },
  ]),
  ...g("Performance", [
    { key: "ret_7d", label: "7 Day Return (%)", fmt: "pct" },
    { key: "ret_1m", label: "1 Month Return (%)", fmt: "pct" },
    { key: "ret_3m", label: "3 Month Return (%)", fmt: "pct" },
    { key: "ret_6m", label: "6 Month Return (%)", fmt: "pct" },
    { key: "ret_ytd", label: "YTD Return (%)", fmt: "pct" },
    { key: "ret_1y", label: "1 Year Return (%)", fmt: "pct" },
    { key: "ret_5y", label: "5 Year Return (%)", fmt: "pct" },
    { key: "pct_from_high", label: "% Below 52-Week High", fmt: "pct" },
  ]),
  ...g("Ownership & sentiment", [
    { key: "analyst_count", label: "Analyst Coverage", fmt: "num" },
    { key: "analyst_rating", label: "Analyst Rating (1 buy – 5 sell)", fmt: "ratio" },
    { key: "insider_pct", label: "Insider Ownership (%)", fmt: "pct" },
    { key: "institution_pct", label: "Institutional Ownership (%)", fmt: "pct" },
    { key: "short_pct", label: "Short Interest (% of float)", fmt: "pct" },
  ]),
];

export const METRIC_GROUPS = [...new Set(METRICS.map((m) => m.group))];

/** USD market-cap buckets (same thresholds most screeners use). */
export const CAP_SIZES = [
  { key: "mega", label: "Mega (>$200b)", min: 200e9, max: undefined },
  { key: "large", label: "Large ($10–200b)", min: 10e9, max: 200e9 },
  { key: "mid", label: "Mid ($2–10b)", min: 2e9, max: 10e9 },
  { key: "small", label: "Small ($300m–2b)", min: 300e6, max: 2e9 },
  { key: "micro", label: "Micro (<$300m)", min: undefined, max: 300e6 },
] as const;

export const SNOWFLAKE_AXES = [
  { key: "value", col: "score_value", label: "Value" },
  { key: "future", col: "score_future", label: "Future" },
  { key: "past", col: "score_past", label: "Past" },
  { key: "health", col: "score_health", label: "Health" },
  { key: "dividends", col: "score_dividends", label: "Dividends" },
  { key: "momentum", col: "score_momentum", label: "Momentum" },
  { key: "quality", col: "score_quality", label: "Quality" },
  { key: "sentiment", col: "score_sentiment", label: "Sentiment" },
] as const;

export const MAX_AXIS = 10;
export const MAX_TOTAL = SNOWFLAKE_AXES.length * MAX_AXIS;

export type AxisKey = (typeof SNOWFLAKE_AXES)[number]["key"];

export const SORTABLE = new Set<string>([
  ...METRICS.map((m) => m.key),
  ...SNOWFLAKE_AXES.map((a) => a.col),
  "score_total",
  "name",
  "symbol",
]);

export const metricByKey = (k: string) => METRICS.find((m) => m.key === k);
