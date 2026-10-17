import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "@/lib/auth";

// Everything requires a session except the login page/endpoint, the health check and the cron endpoint
// (which checks its own bearer token or session).
const PUBLIC = ["/login", "/api/login", "/api/health", "/api/alerts/run"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!authEnabled()) {
    // local `npm run dev` stays open; a production server must never run unprotected
    if (process.env.NODE_ENV === "production" && pathname !== "/api/health") {
      return new NextResponse("APP_PASSWORD is not set: refusing to serve without a login.", { status: 503 });
    }
    return NextResponse.next();
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "login required" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // skip Next's static assets and the favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
