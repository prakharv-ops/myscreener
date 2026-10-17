import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const all: { symbol: string; detail_failures: number; has_details: boolean }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("stocks").select("symbol,detail_failures,has_details").order("symbol").range(from, from + 999);
  if (error) throw error; all.push(...data); if (data.length < 1000) break;
}
const sfx = (s: string) => s.match(/\.([A-Z]+)$/)?.[1] ?? "US";
const t = new Map<string, { n: number; ok: number; failed: number; pending: number }>();
for (const r of all) {
  const k = sfx(r.symbol); const e = t.get(k) ?? { n: 0, ok: 0, failed: 0, pending: 0 };
  e.n++; if (r.has_details) e.ok++; else if (r.detail_failures > 0) e.failed++; else e.pending++;
  t.set(k, e);
}
console.log("suffix   total   ok  failed  pending  fail%(of attempted)");
for (const [k, e] of [...t].sort((a, b) => b[1].failed - a[1].failed)) console.log(k.padEnd(6), String(e.n).padStart(7), String(e.ok).padStart(5), String(e.failed).padStart(7), String(e.pending).padStart(8), `${Math.round((100 * e.failed) / Math.max(1, e.ok + e.failed))}%`.padStart(8));
