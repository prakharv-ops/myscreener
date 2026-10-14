import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScreenSpec } from "./screen";

export interface SavedScreen {
  id: string;
  name: string;
  spec: ScreenSpec;
  created_at: string;
  alerts_enabled: boolean;
  last_matches: string[] | null; // null = alert baseline not taken yet
  last_run_at: string | null;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = () => createClient(url!, key!, { auth: { persistSession: false } });

// Without Supabase, fall back to a local JSON file so the feature works in mock mode.
const FILE = path.join(process.cwd(), ".data", "saved-screens.json");
export async function readJson<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
}
export async function writeJson(file: string, rows: unknown[]) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(rows, null, 2));
}
const readFileStore = () => readJson<SavedScreen>(FILE);
const writeFileStore = (rows: SavedScreen[]) => writeJson(FILE, rows);

export async function listScreens(): Promise<SavedScreen[]> {
  if (!url || !key) return (await readFileStore()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await sb().from("saved_screens").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as SavedScreen[];
}

export async function createScreen(name: string, spec: ScreenSpec): Promise<SavedScreen> {
  if (!url || !key) {
    const row: SavedScreen = {
      id: randomUUID(), name, spec, created_at: new Date().toISOString(),
      alerts_enabled: false, last_matches: null, last_run_at: null,
    };
    await writeFileStore([row, ...(await readFileStore())]);
    return row;
  }
  const { data, error } = await sb().from("saved_screens").insert({ name, spec }).select().single();
  if (error) throw new Error(error.message);
  return data as SavedScreen;
}

export async function deleteScreen(id: string) {
  if (!url || !key) return writeFileStore((await readFileStore()).filter((r) => r.id !== id));
  const { error } = await sb().from("saved_screens").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type ScreenPatch = Partial<Pick<SavedScreen, "alerts_enabled" | "last_matches" | "last_run_at">>;

export async function updateScreen(id: string, patch: ScreenPatch) {
  if (!url || !key) {
    return writeFileStore((await readFileStore()).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  const { error } = await sb().from("saved_screens").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
