import { runAlerts } from "@/lib/alerts";

// Hit by a scheduler (Vercel Cron, GitHub Action, `curl`). If CRON_SECRET is set it must be sent as a Bearer token.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runAlerts());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
export { handle as GET, handle as POST };
