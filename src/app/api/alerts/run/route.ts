import { runAlerts } from "@/lib/alerts";
import { authEnabled, SESSION_COOKIE, verifySession } from "@/lib/auth";

// Hit by a scheduler (`Authorization: Bearer $CRON_SECRET`) or the in-app "Check now" button (session cookie).
async function handle(request: Request) {
  // allowed with the cron Bearer token, or from a logged-in browser (the "Check now" button)
  const secret = process.env.CRON_SECRET;
  const bearerOk = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  const sessionOk = authEnabled() ? await verifySession(cookie) : process.env.NODE_ENV !== "production";
  if (!bearerOk && !sessionOk) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runAlerts());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
// POST only: browsers send cookies on cross-site GET navigations, so a GET trigger would be open to CSRF
export { handle as POST };
