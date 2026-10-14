import { hub, type Tick } from "@/lib/live";


// GET /api/live?symbols=AAPL,MSFT,... -> Server-Sent Events: `hello` once, then `tick` per price change.
export async function GET(request: Request) {
  const symbols = new Set(
    (new URL(request.url).searchParams.get("symbols") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z0-9.\-^=]{1,15}$/.test(s))
      .slice(0, 80),
  );
  if (!symbols.size) return new Response("symbols required", { status: 400 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const write = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { cleanup(); } };
      const client = { symbols, send: (t: Tick) => write(`event: tick\ndata: ${JSON.stringify(t)}\n\n`) };
      write(`event: hello\ndata: ${JSON.stringify({ mode: hub.mode, symbols: symbols.size })}\n\n`);
      hub.add(client);
      const ping = setInterval(() => write(": ping\n\n"), 15000);
      cleanup = () => {
        clearInterval(ping);
        hub.remove(client);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
