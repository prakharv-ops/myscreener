import type { StockRow } from "./screen";

export interface ScreenDigest {
  screen: string;
  entered: StockRow[];
  exited: { symbol: string }[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const f = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d }));
const cap = (v: number | null) => (v == null ? "–" : v >= 1e12 ? `${(v / 1e12).toFixed(1)}t` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}b` : `${(v / 1e6).toFixed(0)}m`);

export function buildDigest(digests: ScreenDigest[]) {
  const total = digests.reduce((n, d) => n + d.entered.length, 0);
  const subject = `MyScreener: ${total} new match${total === 1 ? "" : "es"} across ${digests.length} screen${digests.length === 1 ? "" : "s"}`;

  const html = digests
    .map(
      (d) => `<h3 style="margin:16px 0 6px">${esc(d.screen)} — ${d.entered.length} new</h3>
<table cellpadding="6" style="border-collapse:collapse;font:13px sans-serif">
<tr style="text-align:left;border-bottom:1px solid #ccc"><th>Company</th><th>Price</th><th>PE</th><th>Mkt cap</th><th>Score</th></tr>
${d.entered
  .map(
    (r) => `<tr style="border-bottom:1px solid #eee"><td><b>${esc(r.name)}</b><br><span style="color:#888">${esc(r.symbol)} · ${esc(r.country ?? "")}</span></td>
<td>${esc(r.currency ?? "")} ${f(r.price, 2)}</td><td>${f(r.pe)}</td><td>${cap(r.market_cap)}</td><td>${r.score_total ?? "–"}/30</td></tr>`,
  )
  .join("\n")}
</table>${d.exited.length ? `<p style="font:12px sans-serif;color:#888">No longer matching: ${d.exited.map((x) => esc(x.symbol)).join(", ")}</p>` : ""}`,
    )
    .join("\n");

  const text = digests
    .map(
      (d) =>
        `${d.screen} — ${d.entered.length} new\n` +
        d.entered.map((r) => `  ${r.symbol}  ${r.name}  ${r.currency ?? ""} ${f(r.price, 2)}  PE ${f(r.pe)}  score ${r.score_total ?? "–"}/30`).join("\n") +
        (d.exited.length ? `\n  No longer matching: ${d.exited.map((x) => x.symbol).join(", ")}` : ""),
    )
    .join("\n\n");

  return { subject, html, text };
}
