// Ready-made "investing ideas". Each is a set of filters + a sort; applying one fills the sidebar so it can be
// tweaked, saved, and alerted on like any other screen. Thresholds use the 0–10 Snowflake axes and USD caps.

export interface PresetFilters {
  regions?: string[];
  markets?: string[];
  sectors?: string[];
  industries?: string[];
  capSizes?: ("mega" | "large" | "mid" | "small" | "micro")[];
  snowflake?: Record<string, number>;
  metrics?: { key: string; min?: number; max?: number }[];
}

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  filters: PresetFilters;
  sort: { key: string; dir: "asc" | "desc" };
}

export const PRESETS: Preset[] = [
  {
    id: "undervalued-quality",
    title: "Undervalued quality",
    blurb: "Profitable, healthy companies trading cheaply versus earnings, cash flow and analyst targets.",
    emoji: "💎",
    filters: { snowflake: { value: 7, quality: 7, health: 6 }, capSizes: ["mega", "large", "mid", "small"] },
    sort: { key: "score_total", dir: "desc" },
  },
  {
    id: "dividend-powerhouses",
    title: "Dividend powerhouses",
    blurb: "Yields of 3%+ with sustainable payouts and solid balance sheets.",
    emoji: "💰",
    filters: { snowflake: { dividends: 7.5, health: 6 }, metrics: [{ key: "div_yield", min: 3 }, { key: "payout_ratio", max: 75 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "score_dividends", dir: "desc" },
  },
  {
    id: "high-growth",
    title: "High growth",
    blurb: "Sales growing 25%+ a year with strong forecast earnings growth, $2b+ companies.",
    emoji: "🚀",
    filters: { snowflake: { future: 8, health: 4 }, metrics: [{ key: "revenue_growth", min: 25 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "score_future", dir: "desc" },
  },
  {
    id: "quality-compounders",
    title: "Quality compounders",
    blurb: "High returns on equity, fat margins, a strong track record and little debt.",
    emoji: "🏰",
    filters: { snowflake: { quality: 8, past: 6.5, health: 6.5 }, metrics: [{ key: "roe", min: 15 }], capSizes: ["mega", "large", "mid", "small"] },
    sort: { key: "score_quality", dir: "desc" },
  },
  {
    id: "momentum-leaders",
    title: "Momentum leaders",
    blurb: "Strong trends across 1–12 months and trading within 10% of the 52-week high.",
    emoji: "📈",
    filters: { snowflake: { momentum: 7.5 }, metrics: [{ key: "pct_from_high", min: -10 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "ret_6m", dir: "desc" },
  },
  {
    id: "cheap-large-caps",
    title: "Cheap large caps",
    blurb: "Companies worth $10b+ on a single-digit to low-teens PE.",
    emoji: "🏷️",
    filters: { capSizes: ["mega", "large"], metrics: [{ key: "pe", min: 0.1, max: 12 }] },
    sort: { key: "pe", dir: "asc" },
  },
  {
    id: "cash-machines",
    title: "Cash machines",
    blurb: "Free cash flow yield of 7%+ with healthy finances.",
    emoji: "🏧",
    filters: { snowflake: { health: 5 }, metrics: [{ key: "fcf_yield", min: 7 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "fcf_yield", dir: "desc" },
  },
  {
    id: "analyst-favourites",
    title: "Analyst favourites",
    blurb: "Widely covered stocks with buy ratings and big upside to price targets.",
    emoji: "🎯",
    filters: { snowflake: { sentiment: 8 }, metrics: [{ key: "analyst_count", min: 15 }] },
    sort: { key: "score_sentiment", dir: "desc" },
  },
  {
    id: "fallen-angels",
    title: "Fallen angels",
    blurb: "Quality businesses down 30%+ from their 52-week high.",
    emoji: "🪂",
    filters: { snowflake: { quality: 7, health: 6 }, metrics: [{ key: "pct_from_high", max: -30 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "pct_from_high", dir: "asc" },
  },
  {
    id: "growth-at-reasonable-price",
    title: "Growth at a reasonable price",
    blurb: "Forecast earnings growth without paying up for it (PEG under 1.2).",
    emoji: "⚖️",
    filters: { snowflake: { future: 6, health: 5 }, metrics: [{ key: "peg", min: 0.1, max: 1.2 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "score_future", dir: "desc" },
  },
  {
    id: "insider-owned",
    title: "Founder & insider owned",
    blurb: "Insiders own 20%+ of the company: management with skin in the game.",
    emoji: "🤝",
    filters: { snowflake: { quality: 7.5 }, metrics: [{ key: "insider_pct", min: 30 }], capSizes: ["mega", "large", "mid"] },
    sort: { key: "insider_pct", dir: "desc" },
  },
  {
    id: "fortress-small-caps",
    title: "Fortress small caps",
    blurb: "$300m–2b companies with almost no debt and plenty of liquidity.",
    emoji: "🛡️",
    filters: { capSizes: ["small"], snowflake: { past: 6, quality: 6 }, metrics: [{ key: "debt_to_equity", max: 30 }, { key: "current_ratio", min: 1.5 }] },
    sort: { key: "score_total", dir: "desc" },
  },
  {
    id: "asia-tech-leaders",
    title: "Asia tech leaders",
    blurb: "Profitable Asia-Pacific technology companies worth $2b+.",
    emoji: "🌏",
    filters: { regions: ["Asia-Pacific"], sectors: ["Technology"], capSizes: ["mega", "large", "mid"], snowflake: { quality: 7 } },
    sort: { key: "score_total", dir: "desc" },
  },
  {
    id: "europe-income",
    title: "European income",
    blurb: "European dividend payers yielding 4%+.",
    emoji: "🇪🇺",
    filters: { regions: ["Europe"], snowflake: { dividends: 7, health: 5 }, metrics: [{ key: "div_yield", min: 4 }] },
    sort: { key: "div_yield", dir: "desc" },
  },
  {
    id: "india-quality",
    title: "India quality",
    blurb: "Indian companies with strong profitability and balance sheets.",
    emoji: "🇮🇳",
    filters: { markets: ["India"], snowflake: { quality: 7.5, health: 7 }, capSizes: ["mega", "large", "mid", "small"] },
    sort: { key: "score_total", dir: "desc" },
  },
  {
    id: "short-squeeze-watch",
    title: "Heavily shorted",
    blurb: "Short interest above 15% of float: crowded bets that can move sharply either way.",
    emoji: "⚠️",
    filters: { metrics: [{ key: "short_pct", min: 15 }], capSizes: ["large", "mid"] },
    sort: { key: "short_pct", dir: "desc" },
  },
];
