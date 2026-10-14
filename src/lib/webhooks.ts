// Outgoing webhooks for alerts. Configure ALERT_WEBHOOK_URLS (comma-separated) and optionally ALERT_WEBHOOK_SECRET.
//  - hooks.slack.com   -> Slack message ({ text })
//  - discord.com/api/webhooks -> Discord message ({ content })
//  - anything else (Zapier, n8n, Make, your own server) -> signed JSON.
import { createHmac, randomUUID } from "node:crypto";
import type { ScreenDigest } from "./alert-email";

export interface WebhookResult {
  url: string; // host only; never log full URLs (they contain secrets)
  ok: boolean;
  status?: number;
  error?: string;
}

const urls = () => (process.env.ALERT_WEBHOOK_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const webhooksConfigured = () => urls().length > 0;

const f = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d }));

function summaryText(digests: ScreenDigest[]) {
  return digests
    .map((d) =>
      [`*${d.screen}*: ${d.entered.length} new match${d.entered.length === 1 ? "" : "es"}`]
        .concat(d.entered.slice(0, 15).map((r) => `• ${r.symbol} ${r.name} — ${r.currency ?? ""} ${f(r.price, 2)}, PE ${f(r.pe)}, score ${r.score_total ?? "–"}/80`))
        .concat(d.entered.length > 15 ? [`…and ${d.entered.length - 15} more`] : [])
        .concat(d.exited.length ? [`No longer matching: ${d.exited.map((x) => x.symbol).join(", ")}`] : [])
        .join("\n"),
    )
    .join("\n\n");
}

export async function sendWebhooks(digests: ScreenDigest[]): Promise<WebhookResult[]> {
  const sentAt = new Date().toISOString();
  const generic = {
    event: "screen.matches",
    sent_at: sentAt,
    screens: digests.map((d) => ({
      name: d.screen,
      entered: d.entered.map((r) => ({
        symbol: r.symbol, name: r.name, exchange: r.exchange, country: r.country, sector: r.sector, currency: r.currency,
        price: r.price, market_cap: r.market_cap, pe: r.pe, div_yield: r.div_yield, score_total: r.score_total,
      })),
      exited: d.exited.map((x) => x.symbol),
    })),
  };
  const text = summaryText(digests);

  return Promise.all(
    urls().map(async (u): Promise<WebhookResult> => {
      let host = "invalid-url";
      try {
        const parsed = new URL(u);
        host = parsed.host;
        let payload: unknown = generic;
        if (host === "hooks.slack.com") payload = { text };
        else if (/(^|\.)discord(app)?\.com$/.test(host)) payload = { content: text.replace(/\*/g, "**").slice(0, 1990) };
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = { "Content-Type": "application/json", "X-MyScreener-Delivery": randomUUID() };
        const secret = process.env.ALERT_WEBHOOK_SECRET;
        if (secret) headers["X-MyScreener-Signature"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
        const res = await fetch(u, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
        return { url: host, ok: res.ok, status: res.status };
      } catch (e) {
        return { url: host, ok: false, error: (e as Error).message };
      }
    }),
  );
}
