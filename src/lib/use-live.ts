"use client";
import { useEffect, useState } from "react";

export interface LivePrice {
  price: number;
  dir: 1 | -1 | 0; // vs previous live price
  at: number; // changes on every tick; use as a React key to retrigger the flash animation
}
export type LiveMode = "connecting" | "finnhub-ws+yahoo-poll" | "yahoo-poll" | "offline";

/** Subscribes to /api/live for the given symbols and batches updates (~2/s) so the table stays smooth. */
export function useLive(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [mode, setMode] = useState<LiveMode>("connecting");
  const key = symbols.join(",");

  useEffect(() => {
    if (!key) return;
    let es: EventSource | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const buf = new Map<string, number>();

    const flush = () => {
      flushTimer = undefined;
      const batch = [...buf];
      buf.clear();
      setPrices((prev) => {
        const next = { ...prev };
        for (const [sym, price] of batch) {
          const old = prev[sym]?.price;
          next[sym] = { price, dir: old === undefined || old === price ? (prev[sym]?.dir ?? 0) : price > old ? 1 : -1, at: Date.now() };
        }
        return next;
      });
    };

    // small delay so rapid page/filter changes don't open a connection each
    const open = setTimeout(() => {
      es = new EventSource(`/api/live?symbols=${encodeURIComponent(key)}`);
      es.addEventListener("hello", (e) => setMode(JSON.parse((e as MessageEvent).data).mode));
      es.addEventListener("tick", (e) => {
        const t = JSON.parse((e as MessageEvent).data) as { symbol: string; price: number };
        buf.set(t.symbol, t.price);
        flushTimer ??= setTimeout(flush, 400);
      });
      es.onerror = () => setMode("offline"); // EventSource retries by itself; "hello" flips it back
    }, 300);

    return () => {
      clearTimeout(open);
      clearTimeout(flushTimer);
      es?.close();
    };
  }, [key]);

  return { prices, mode: key ? mode : "connecting" };
}
