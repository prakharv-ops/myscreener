import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildDigest, type ScreenDigest } from "./alert-email";
import { emailConfigured, sendEmail, type EmailResult } from "./email";
import { sendWebhooks, type WebhookResult } from "./webhooks";
import { allMatches } from "./run-screen";
import { listScreens, readJson, updateScreen, writeJson } from "./saved";

export interface ScreenAlert {
  id: string;
  screen_id: string;
  screen_name: string;
  symbol: string;
  stock_name: string | null;
  kind: "entered" | "exited";
  seen: boolean;
  created_at: string;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = () => createClient(url!, key!, { auth: { persistSession: false } });
const FILE = path.join(process.cwd(), ".data", "alerts.json");

export async function listAlerts(limit = 100): Promise<ScreenAlert[]> {
  if (!url || !key) {
    return (await readJson<ScreenAlert>(FILE)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  const { data, error } = await sb().from("screen_alerts").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as ScreenAlert[];
}

async function addAlerts(rows: Omit<ScreenAlert, "id" | "seen" | "created_at">[]) {
  if (!rows.length) return;
  if (!url || !key) {
    const now = new Date().toISOString();
    const add = rows.map((r) => ({ ...r, id: randomUUID(), seen: false, created_at: now }));
    return writeJson(FILE, [...add, ...(await readJson<ScreenAlert>(FILE))]);
  }
  const { error } = await sb().from("screen_alerts").insert(rows);
  if (error) throw new Error(error.message);
}

/** ids = specific alerts, or omitted = mark all as seen */
export async function markSeen(ids?: string[]) {
  if (!url || !key) {
    const all = await readJson<ScreenAlert>(FILE);
    return writeJson(FILE, all.map((a) => (!ids || ids.includes(a.id) ? { ...a, seen: true } : a)));
  }
  let q = sb().from("screen_alerts").update({ seen: true }).eq("seen", false);
  if (ids) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export interface RunSummary {
  screen: string;
  matches: number;
  entered: number;
  exited: number;
  baseline: boolean;
}

/** Re-run every alert-enabled saved screen and record who entered / left it. */
export async function runAlerts(): Promise<{ summaries: RunSummary[]; email: EmailResult | null; webhooks: WebhookResult[] }> {
  const summaries: RunSummary[] = [];
  const digests: ScreenDigest[] = [];
  for (const s of (await listScreens()).filter((x) => x.alerts_enabled)) {
    const rows = await allMatches(s.spec);
    const now = new Set(rows.map((r) => r.symbol));
    const prev = s.last_matches ? new Set(s.last_matches) : null;
    const byName = new Map(rows.map((r) => [r.symbol, r.name]));
    const entered = prev ? [...now].filter((x) => !prev.has(x)) : [];
    const exited = prev ? [...prev].filter((x) => !now.has(x)) : [];
    const base = { screen_id: s.id, screen_name: s.name };
    await addAlerts([
      ...entered.map((symbol) => ({ ...base, symbol, stock_name: byName.get(symbol) ?? null, kind: "entered" as const })),
      ...exited.map((symbol) => ({ ...base, symbol, stock_name: null, kind: "exited" as const })),
    ]);
    if (entered.length) {
      digests.push({
        screen: s.name,
        entered: rows.filter((r) => entered.includes(r.symbol)),
        exited: exited.map((symbol) => ({ symbol })),
      });
    }
    await updateScreen(s.id, { last_matches: [...now], last_run_at: new Date().toISOString() });
    summaries.push({ screen: s.name, matches: now.size, entered: entered.length, exited: exited.length, baseline: !prev });
  }
  // One digest per run. Alerts are already persisted, so an email failure is reported, not thrown.
  let email: EmailResult | null = null;
  if (digests.length) {
    const { subject, html, text } = buildDigest(digests);
    email = await sendEmail(subject, html, text);
  }
  const webhooks = digests.length ? await sendWebhooks(digests) : [];
  return { summaries, email, webhooks };
}

export { emailConfigured };
