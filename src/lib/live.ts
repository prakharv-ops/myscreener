// Live price hub (server-side singleton) feeding the SSE route.
//  - US symbols: Finnhub free WebSocket trades, if FINNHUB_API_KEY is set.
//  - everything else (and US too when there is no key): Yahoo quote polling.
import YahooFinance from "yahoo-finance2";

export interface Tick {
  symbol: string; // Yahoo-style, as used everywhere in the app
  price: number;
  ts: number;
}
type Send = (t: Tick) => void;
interface Client { symbols: Set<string>; send: Send }

const KEY = process.env.FINNHUB_API_KEY;
const WS_URL = process.env.FINNHUB_WS_URL ?? "wss://ws.finnhub.io";
const WS_CAP = Number(process.env.LIVE_WS_CAP ?? 30); // Finnhub free tier limit (docs/reviews say 30-50)
const POLL_MS = Number(process.env.LIVE_POLL_MS ?? 5000);
const POLL_CAP = 80;

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const isUS = (s: string) => !s.includes(".") && !s.includes("^"); // US tickers have no exchange suffix
const toFinnhub = (s: string) => s.replace("-", "."); // BRK-B -> BRK.B
const fromFinnhub = new Map<string, string>(); // BRK.B -> BRK-B

class Hub {
  clients = new Set<Client>();
  last = new Map<string, Tick>();
  ws: WebSocket | null = null;
  wsOpen = false;
  wsSubs = new Set<string>(); // Yahoo-style symbols currently subscribed upstream
  pollTimer: ReturnType<typeof setInterval> | null = null;
  pollSymbols: string[] = [];
  retry = 0;
  retryTimer: ReturnType<typeof setTimeout> | null = null;

  get mode() {
    return KEY ? "finnhub-ws+yahoo-poll" : "yahoo-poll";
  }

  add(c: Client) {
    this.clients.add(c);
    for (const s of c.symbols) { const t = this.last.get(s); if (t) c.send(t); } // replay cached prices
    this.sync();
  }
  remove(c: Client) {
    this.clients.delete(c);
    this.sync();
  }

  emit(t: Tick) {
    this.last.set(t.symbol, t);
    for (const c of this.clients) if (c.symbols.has(t.symbol)) c.send(t);
  }

  /** Reconcile upstream subscriptions with what connected clients currently look at. */
  sync() {
    const union = [...new Set([...this.clients].flatMap((c) => [...c.symbols]))];
    const wsWant = KEY ? union.filter(isUS).slice(0, WS_CAP) : [];
    const pollWant = union.filter((s) => !wsWant.includes(s)).slice(0, POLL_CAP);

    // websocket
    if (!wsWant.length) this.closeWs();
    else {
      if (!this.ws) this.openWs();
      if (this.wsOpen) {
        for (const s of this.wsSubs) if (!wsWant.includes(s)) { this.wsSend({ type: "unsubscribe", symbol: toFinnhub(s) }); this.wsSubs.delete(s); }
        for (const s of wsWant) if (!this.wsSubs.has(s)) { fromFinnhub.set(toFinnhub(s), s); this.wsSend({ type: "subscribe", symbol: toFinnhub(s) }); this.wsSubs.add(s); }
      }
      this.wsWant = wsWant;
    }

    // polling
    this.pollSymbols = pollWant;
    if (!pollWant.length) {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
    } else if (!this.pollTimer) {
      this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
      void this.poll();
    } else if (pollWant.some((s) => !this.last.has(s))) void this.poll(); // new symbol: don't wait for the next tick
  }
  wsWant: string[] = [];

  wsSend(m: object) {
    if (this.ws && this.wsOpen) this.ws.send(JSON.stringify(m));
  }

  openWs() {
    const ws = new WebSocket(`${WS_URL}?token=${KEY}`);
    this.ws = ws;
    ws.onopen = () => {
      this.wsOpen = true;
      this.retry = 0;
      this.wsSubs.clear();
      this.sync();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type !== "trade" || !Array.isArray(msg.data)) return;
        const latest = new Map<string, { p: number; t: number }>();
        for (const d of msg.data as { s: string; p: number; t: number }[]) {
          const cur = latest.get(d.s);
          if (!cur || d.t >= cur.t) latest.set(d.s, { p: d.p, t: d.t });
        }
        for (const [s, v] of latest) this.emit({ symbol: fromFinnhub.get(s) ?? s, price: v.p, ts: v.t });
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => {
      this.ws = null;
      this.wsOpen = false;
      this.wsSubs.clear();
      if (this.clients.size && this.wsWant.length) {
        this.retryTimer = setTimeout(() => this.sync(), Math.min(30000, 1000 * 2 ** this.retry++));
      }
    };
    ws.onerror = () => ws.close();
  }

  closeWs() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.wsWant = [];
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this.ws = null;
    this.wsOpen = false;
    this.wsSubs.clear();
  }

  polling = false;
  async poll() {
    if (this.polling || !this.pollSymbols.length) return;
    this.polling = true;
    try {
      const res = (await yf.quote(this.pollSymbols, {}, { validateResult: false })) as unknown as {
        symbol: string; regularMarketPrice?: number; regularMarketTime?: Date | number;
      }[];
      for (const q of res) {
        if (typeof q.regularMarketPrice !== "number") continue;
        const prev = this.last.get(q.symbol);
        if (prev && prev.price === q.regularMarketPrice) continue; // only push changes
        const ts = q.regularMarketTime ? +new Date(q.regularMarketTime) : Date.now();
        this.emit({ symbol: q.symbol, price: q.regularMarketPrice, ts: ts < 1e12 ? ts * 1000 : ts });
      }
    } catch (e) {
      console.warn("live poll failed:", (e as Error).message);
    } finally {
      this.polling = false;
    }
  }
}

// survive dev-server hot reloads
const g = globalThis as unknown as { __hub?: Hub };
export const hub = (g.__hub ??= new Hub());
