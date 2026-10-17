import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const DAY = 864e5;
// range -> lookback + bar size (weekly bars for 5Y keep the payload ~260 points)
const RANGES = {
  "1m": { days: 31, interval: "1d" },
  "6m": { days: 183, interval: "1d" },
  "1y": { days: 366, interval: "1d" },
  "5y": { days: 5 * 366, interval: "1wk" },
} as const;
type Range = keyof typeof RANGES;

const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 15 * 60_000;

// GET /api/stock/AAPL/history?range=1y -> { currency, points: [{ t, c }] } (adjusted closes)
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const range = (new URL(req.url).searchParams.get("range") ?? "1y") as Range;
  if (!RANGES[range] || !/^[A-Za-z0-9.\-^=]{1,15}$/.test(symbol)) return Response.json({ error: "bad request" }, { status: 400 });

  const key = `${symbol}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);

  try {
    const { days, interval } = RANGES[range];
    const r = await yf.chart(symbol, { period1: new Date(Date.now() - days * DAY), interval });
    const points = r.quotes
      .map((q) => ({ t: +new Date(q.date), c: q.adjclose ?? q.close }))
      .filter((p): p is { t: number; c: number } => typeof p.c === "number" && Number.isFinite(p.c));
    const body = { currency: r.meta.currency ?? null, points };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 500) cache.delete(cache.keys().next().value!); // simple bound
    return Response.json(body);
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
