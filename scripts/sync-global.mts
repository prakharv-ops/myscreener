// Usage: npm run global [-- --max 20000]        (DRY_RUN=1 to preview without writing)
// Grows the universe beyond the US from free official exchange listings, then keeps the largest companies
// per country (by USD market cap, from Yahoo batch quotes) until the whole universe reaches --max rows.
// Quotas spread the room across countries so no single market dominates. Existing rows are never overwritten.
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { regionOf } from "../src/lib/regions";
import { csv, fromHeader, toRows } from "./lib/parse.mjs";
import { QUOTA } from "./lib/markets.mjs";
import { capToUsd, loadFx } from "./lib/fx.mjs";
import { num, withRetry, yf } from "./lib/yahoo-detail.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = Boolean(process.env.DRY_RUN);
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const arg = (n: string, d: number) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const MAX = arg("max", Number(process.env.UNIVERSE_MAX ?? 20000));
const MIN_CAP_USD = 30e6;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

interface Candidate { symbol: string; name: string; country: string }

// ---------- download helpers ----------
async function get(u: string, headers: Record<string, string> = {}) {
  const res = await fetch(u, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(u).host}`);
  return res;
}
const text = async (u: string, h?: Record<string, string>) => (await get(u, h)).text();
const json = async <T,>(u: string, h?: Record<string, string>) => (await get(u, h)).json() as Promise<T>;
const sheetRows = async (u: string, sheet?: string) => {
  const wb = XLSX.read(new Uint8Array(await (await get(u)).arrayBuffer()), { type: "array" });
  return toRows(wb.Sheets[sheet ?? wb.SheetNames[0]]);
};
// ---------- one function per exchange; each returns Yahoo-style symbols ----------
const SOURCES: Record<string, () => Promise<Candidate[]>> = {
  async "NSE India"() {
    const rows = csv(await text("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"));
    return rows.slice(1).filter((r) => r[2] === "EQ").map((r) => ({ symbol: `${r[0]}.NS`, name: r[1], country: "India" }));
  },
  async "Japan Exchange Group"() {
    const rows = fromHeader(await sheetRows("https://www.jpx.co.jp/english/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_e.xlsx"), "Effective Date");
    return rows
      .filter((r) => /^(Prime|Standard|Growth) Market/.test(r["Section/Products"]))
      .map((r) => ({ symbol: `${r["Local Code"]}.T`, name: r["Name (English)"], country: "Japan" }));
  },
  async "Shanghai + Shenzhen"() {
    // official SSE list (paged JSON, needs a Referer) + SZSE A-share list (xlsx)
    const out: Candidate[] = [];
    for (let page = 1; ; page++) {
      const j = await json<{ pageHelp: { data: { A_STOCK_CODE: string; COMPANY_ABBR_EN?: string; COMPANY_ABBR: string }[]; pageCount: number } }>(
        `https://query.sse.com.cn/sseQuery/commonQuery.do?sqlId=COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L&isPagination=true&pageHelp.pageSize=500&pageHelp.pageNo=${page}&pageHelp.beginPage=${page}&STOCK_TYPE=1&REG_PROVINCE=&CSRC_CODE=&STOCK_CODE=&COMPANY_STATUS=2,4,5,7,8&type=inParams`,
        { Referer: "https://www.sse.com.cn/" });
      out.push(...j.pageHelp.data.map((d) => ({ symbol: `${d.A_STOCK_CODE}.SS`, name: d.COMPANY_ABBR_EN || d.COMPANY_ABBR, country: "China" })));
      if (page >= j.pageHelp.pageCount || !j.pageHelp.data.length) break;
    }
    try {
      const sz = fromHeader(await sheetRows("https://www.szse.cn/api/report/ShowReport?SHOWTYPE=xlsx&CATALOGID=1110&TABKEY=tab1"), "板块");
      out.push(...sz.filter((r) => /^\d{6}$/.test(r["A股代码"])).map((r) => ({ symbol: `${r["A股代码"]}.SZ`, name: r["A股简称"], country: "China" })));
    } catch {
      // SZSE xlsx is occasionally served in a format SheetJS can't open; Eastmoney covers Shenzhen as a backup
      for (let pn = 1; ; pn++) {
        const j = await json<{ data?: { total: number; diff: { f12: string; f14: string }[] } }>(
          `https://push2.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f20&fs=m:0+t:6,m:0+t:80&fields=f12,f14`);
        const diff = j.data?.diff ?? [];
        out.push(...diff.map((d) => ({ symbol: `${d.f12}.SZ`, name: d.f14, country: "China" })));
        if (!diff.length || pn * 100 >= (j.data?.total ?? 0)) break;
      }
    }
    return out;
  },
  async "HKEX"() {
    const rows = fromHeader(await sheetRows("https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"), "Stock Code");
    return rows
      .filter((r) => r["Category"] === "Equity" && /Equity Securities/.test(r["Sub-Category"]) && Number(r["Stock Code"]) < 10000)
      .map((r) => ({ symbol: `${String(Number(r["Stock Code"])).padStart(4, "0")}.HK`, name: r["Name of Securities"], country: "Hong Kong" }));
  },
  async "KRX (KOSPI + KOSDAQ)"() {
    const out: Candidate[] = [];
    for (const [mkt, suffix] of [["stockMkt", "KS"], ["kosdaqMkt", "KQ"]] as const) {
      const buf = await (await get(`https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType=${mkt}`)).arrayBuffer();
      const html = new TextDecoder("euc-kr").decode(buf);
      const cells = [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      const width = cells.indexOf("지역") + 1; // last header column
      const header = cells.slice(0, width);
      const iName = header.indexOf("회사명"), iCode = header.indexOf("종목코드");
      for (let i = width; i + width <= cells.length; i += width) {
        const code = cells[i + iCode];
        if (code) out.push({ symbol: `${code.padStart(6, "0")}.${suffix}`, name: cells[i + iName], country: "South Korea" });
      }
    }
    return out;
  },
  async "TWSE + TPEx"() {
    const twse = await json<{ Code: string; Name: string }[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
    const tpex = await json<Record<string, string>[]>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes");
    const isStock = (c: string) => /^[1-9]\d{3}$/.test(c); // ETFs/warrants start with 0 or have 5-6 digits
    const codeKey = Object.keys(tpex[0] ?? {}).find((k) => /code/i.test(k)) ?? "SecuritiesCompanyCode";
    const nameKey = Object.keys(tpex[0] ?? {}).find((k) => /name/i.test(k)) ?? "CompanyName";
    return [
      ...twse.filter((r) => isStock(r.Code)).map((r) => ({ symbol: `${r.Code}.TW`, name: r.Name, country: "Taiwan" })),
      ...tpex.filter((r) => isStock(r[codeKey])).map((r) => ({ symbol: `${r[codeKey]}.TWO`, name: r[nameKey], country: "Taiwan" })),
    ];
  },
  async "LSE (Jan 2021 list)"() {
    // LSE stopped publishing this file at a stable URL in 2021; delisted names drop out at the quote step
    const rows = fromHeader(await sheetRows("https://docs.londonstockexchange.com/sites/default/files/reports/Instrument%20list_3.xlsx", "1.1 Shares"), "TIDM");
    return rows.filter((r) => r["TIDM"]).map((r) => ({ symbol: `${r["TIDM"].replace(/\.$/, "").replace(/\./g, "-")}.L`, name: r["Issuer Name"], country: "United Kingdom" }));
  },
  async "TSX + TSXV"() {
    const out: Candidate[] = [];
    for (const [board, suffix] of [["tsx", "TO"], ["tsxv", "V"]] as const) {
      const j = await json<{ results: { symbol: string; name: string; instruments?: { name: string }[] }[] }>(`https://www.tsx.com/json/company-directory/search/${board}/%5E*`);
      for (const r of j.results) {
        if (/\b(ETF|Fund|Portfolio|Notes?|Split|Income Trust Units)\b/i.test(r.name)) continue;
        if (r.instruments?.some((i) => /\bCDR\b/i.test(i.name))) continue; // Canadian Depositary Receipts of US stocks
        out.push({ symbol: `${r.symbol.replace(/\./g, "-")}.${suffix}`, name: r.name, country: "Canada" });
      }
    }
    return out;
  },
  async "ASX"() {
    const rows = csv(await text("https://www.asx.com.au/asx/research/ASXListedCompanies.csv"));
    const h = rows.findIndex((r) => r[0] === "Company name");
    return rows.slice(h + 1).filter((r) => r[1]).map((r) => ({ symbol: `${r[1]}.AX`, name: r[0], country: "Australia" }));
  },
  async "Euronext"() {
    const rows = csv(await text("https://live.euronext.com/en/pd_es/data/stocks/download?mics=dm_all_stock&initialLetter=&fe_type=csv&fe_decimal_separator=.&fe_date_format=d%2Fm%2FY"), ";");
    const MKT: [RegExp, string, string][] = [
      [/Paris/, "PA", "France"], [/Amsterdam/, "AS", "Netherlands"], [/Brussels/, "BR", "Belgium"], [/Lisbon/, "LS", "Portugal"],
      [/Milan/, "MI", "Italy"], [/Oslo/, "OL", "Norway"], [/Dublin/, "IR", "Ireland"],
    ];
    const out: Candidate[] = [];
    for (const r of rows.slice(1)) {
      if (r.length < 4 || !r[2]) continue;
      const m = MKT.find(([re]) => re.test(r[3]));
      if (m) out.push({ symbol: `${r[2]}.${m[1]}`, name: r[0], country: m[2] });
    }
    return out;
  },
  async "Deutsche Börse"() {
    const res = await get("https://www.cashmarket.deutsche-boerse.com/resource/blob/67858/2cdcbe9f12ea95ed3e68180c8ff9adcb/data/Listed-companies.xlsx");
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    const out: Candidate[] = [];
    for (const sheet of ["Prime Standard", "General Standard", "Scale"]) {
      if (!wb.Sheets[sheet]) continue;
      const rows = fromHeader(toRows(wb.Sheets[sheet]), "ISIN");
      out.push(...rows.filter((r) => r["Trading Symbol"]).map((r) => ({ symbol: `${r["Trading Symbol"]}.DE`, name: r["Company"], country: "Germany" })));
    }
    return out;
  },
  async "SIX Swiss"() {
    const rows = csv(await text("https://www.six-group.com/sheldon/equity_issuers/v1/equity_issuers.csv"), ";");
    const h = rows[0];
    const ix = (n: string) => h.indexOf(n);
    return rows.slice(1)
      .filter((r) => r[ix("Primary listing")] === "TRUE" && r[ix("Country")] === "CH")
      .map((r) => ({ symbol: `${r[ix("Symbol")]}.SW`, name: r[ix("Company")], country: "Switzerland" }));
  },
  async "SGX"() {
    const j = await json<{ data: { prices: { nc: string | null; type: string }[] } }>("https://api.sgx.com/securities/v1.1?excludetypes=bonds&params=nc,cn,type");
    return j.data.prices.filter((p) => p.type === "stocks" && p.nc).map((p) => ({ symbol: `${p.nc}.SI`, name: p.nc!, country: "Singapore" }));
  },
};

// ---------- 1. collect candidates ----------
const existing = new Set<string>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("symbol").order("symbol").range(from, from + 999);
  if (error) throw error;
  data.forEach((r) => existing.add(r.symbol));
  if (data.length < 1000) break;
}
const room = MAX - existing.size;
console.log(`universe has ${existing.size}; room for ${room} more (max ${MAX})`);
if (room <= 0) process.exit(0);

const candidates = new Map<string, Candidate>();
for (const [name, load] of Object.entries(SOURCES)) {
  try {
    const list = await withRetry(load, 2);
    let fresh = 0;
    for (const c of list) if (!existing.has(c.symbol) && !candidates.has(c.symbol)) { candidates.set(c.symbol, c); fresh++; }
    console.log(`  ${name}: ${list.length} listed, ${fresh} new candidates`);
  } catch (e) {
    console.warn(`  ${name}: FAILED (${(e as Error).message.slice(0, 100)}) - skipped`);
  }
}

if (process.env.LIST_ONLY) process.exit(0);

// ---------- 2. batch-quote every candidate for market cap / currency / validity ----------
interface Q {
  symbol: string; quoteType?: string; longName?: string; shortName?: string; fullExchangeName?: string; currency?: string;
  regularMarketPrice?: number; marketCap?: number; trailingPE?: number; priceToBook?: number; epsTrailingTwelveMonths?: number;
  dividendYield?: number; fiftyTwoWeekChangePercent?: number; averageAnalystRating?: string;
}
const symbols = [...candidates.keys()];
const quotes: Q[] = [];
const chunks: string[][] = [];
for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
console.log(`quoting ${symbols.length} candidates in ${chunks.length} batches…`);
let doneBatches = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let c = chunks.shift(); c; c = chunks.shift()) {
    try {
      const res = (await withRetry(() => yf.quote(c!, {}, { validateResult: false }))) as unknown as Q[];
      quotes.push(...res);
    } catch (e) {
      console.warn(`  quote batch failed: ${(e as Error).message.slice(0, 80)}`);
    }
    if (++doneBatches % 25 === 0) console.log(`  ${doneBatches} batches`);
  }
}));
await loadFx(quotes.map((q) => q.currency));

// ---------- 3. pick the largest companies per country within quota ----------
const valid = quotes
  .filter((q) => (!q.quoteType || q.quoteType === "EQUITY") && num(q.regularMarketPrice) != null && q.marketCap && capToUsd(q.currency) != null)
  .map((q) => ({ q, c: candidates.get(q.symbol)!, usd: q.marketCap! * capToUsd(q.currency)! }))
  .filter((x) => x.c && x.usd >= MIN_CAP_USD)
  .sort((a, b) => b.usd - a.usd);

const quotaTotal = Object.values(QUOTA).reduce((a, b) => a + b, 0);
const scale = Math.min(1, room / quotaTotal);
const taken = new Map<string, number>();
const seenName = new Set<string>();
const picked: typeof valid = [];
const leftovers: typeof valid = [];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const x of valid) {
  const n = `${x.c.country}|${norm(x.q.longName ?? x.q.shortName ?? x.c.name)}`;
  if (seenName.has(n)) continue; // same company listed twice on one market (share classes, dual boards)
  seenName.add(n);
  const cap = Math.floor((QUOTA[x.c.country] ?? 0) * scale);
  if ((taken.get(x.c.country) ?? 0) < cap) { picked.push(x); taken.set(x.c.country, (taken.get(x.c.country) ?? 0) + 1); }
  else leftovers.push(x);
}
// unused quota (small markets that ran out of companies) goes to the next-largest companies anywhere
for (const x of leftovers) { if (picked.length >= room) break; picked.push(x); taken.set(x.c.country, (taken.get(x.c.country) ?? 0) + 1); }

console.log(`valid quotes ${valid.length}; picking ${picked.length}`);
for (const [c, n] of [...taken].sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(15)} ${n}`);

// ---------- 4. insert ----------
const rows = picked.map(({ q, c, usd }) => ({
  symbol: q.symbol,
  name: q.longName ?? q.shortName ?? c.name,
  exchange: q.fullExchangeName ?? null,
  country: c.country,
  region: regionOf(c.country),
  currency: q.currency ?? null,
  price: num(q.regularMarketPrice),
  market_cap: num(q.marketCap),
  market_cap_usd: Math.round(usd),
  pe: num(q.trailingPE),
  pb: ["GBp", "ZAc", "ILA"].includes(q.currency ?? "") ? null : num(q.priceToBook),
  eps: num(q.epsTrailingTwelveMonths),
  div_yield: num(q.dividendYield),
  ret_1y: num(q.fiftyTwoWeekChangePercent),
  analyst_rating: q.averageAnalystRating ? num(parseFloat(q.averageAnalystRating)) : null,
}));
if (DRY) {
  console.log("DRY_RUN sample:", rows.slice(0, 5).map((r) => `${r.symbol} ${r.name} $${(r.market_cap_usd / 1e9).toFixed(1)}b`));
  process.exit(0);
}
let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const { data, error } = await sb.from("stocks").upsert(rows.slice(i, i + 500), { onConflict: "symbol", ignoreDuplicates: true }).select("symbol");
  if (error) throw error;
  inserted += data?.length ?? 0;
}
console.log(`inserted ${inserted}; universe now ${existing.size + inserted}`);
