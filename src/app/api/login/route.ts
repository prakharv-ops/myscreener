import { createSession, safeEqual, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

// naive in-memory brute-force brake: 10 failed attempts per IP per 15 minutes
const fails = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60_000, MAX = 10;

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return Response.json({ error: "login is not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const f = fails.get(ip);
  if (f && f.until > Date.now() && f.n >= MAX) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== "string" || !safeEqual(password, expected)) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW };
    fails.set(ip, { n: cur.n + 1, until: cur.until });
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  fails.delete(ip);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": `${SESSION_COOKIE}=${await createSession()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` },
  });
}

/** log out */
export async function DELETE() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
}
