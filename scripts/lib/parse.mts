// Pure parsing helpers for exchange listing files (CSV / XLSX). Used by sync-global; unit-tested.
import * as XLSX from "xlsx";

export const fixRange = (ws: XLSX.WorkSheet) => {
  // some exchange files (HKEX) declare a too-small sheet dimension; recompute it from the cells present
  let maxR = 0, maxC = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  return ws;
};
export const toRows = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(fixRange(ws), { header: 1, blankrows: false, raw: false });
/** Rows after the header row (found by its first cell), as objects keyed by header names. */
export const fromHeader = (rows: unknown[][], firstCell: string) => {
  const h = rows.findIndex((r) => String(r[0] ?? "").trim() === firstCell);
  if (h < 0) throw new Error(`header "${firstCell}" not found`);
  const cols = Array.from(rows[h], (c) => String(c ?? "").trim()); // rows can be sparse arrays
  return rows.slice(h + 1).map((r) => Object.fromEntries(cols.map((c, i) => [c, String(r[i] ?? "").trim()])));
};
export const csv = (body: string, sep = ",") =>
  body.split(/\r?\n/).filter(Boolean).map((l) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.replace(/^﻿/, "").trim());
  });

