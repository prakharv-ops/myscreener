export type Fmt = "num" | "pct" | "usd" | "ratio";

export interface MetricDef {
  key: string; // column in `stocks`
  label: string;
  fmt: Fmt;
}

export const METRICS: MetricDef[] = [
  { key: "market_cap", label: "Market Cap", fmt: "usd" },
  { key: "price", label: "Share Price", fmt: "num" },
  { key: "pe", label: "PE Ratio", fmt: "ratio" },
  { key: "pb", label: "PB Ratio", fmt: "ratio" },
  { key: "peg", label: "PEG Ratio", fmt: "ratio" },
  { key: "earnings_growth_est_1y", label: "1Y Earnings Growth Estimate (%)", fmt: "pct" },
  { key: "earnings_growth_past_1y", label: "Past 1Y Earnings Growth (%)", fmt: "pct" },
  { key: "earnings_growth_past_5y", label: "Past 5Y Earnings Growth (%)", fmt: "pct" },
  { key: "roe", label: "ROE (%)", fmt: "pct" },
  { key: "roa", label: "ROA (%)", fmt: "pct" },
  { key: "eps", label: "EPS", fmt: "num" },
  { key: "debt_to_equity", label: "Debt to Equity (%)", fmt: "pct" },
  { key: "beta", label: "Beta", fmt: "ratio" },
  { key: "div_yield", label: "Dividend Yield (%)", fmt: "pct" },
  { key: "analyst_count", label: "Analyst Coverage", fmt: "num" },
  { key: "profit_margin", label: "Profit Margin (%)", fmt: "pct" },
  { key: "analyst_rating", label: "Analyst Rating (1 buy – 5 sell)", fmt: "ratio" },
  { key: "ret_1y", label: "1 Year Return (%)", fmt: "pct" },
  { key: "ret_5y", label: "5 Year Return (%)", fmt: "pct" },
];

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

export const SORTABLE = new Set([
  ...METRICS.map((m) => m.key),
  "score_total",
  "ret_7d",
  "name",
  "symbol",
]);

export const metricByKey = (k: string) => METRICS.find((m) => m.key === k);
