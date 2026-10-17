// Single-user password gate. A session is "<expiry ms>.<HMAC-SHA256(expiry)>" in an HttpOnly cookie.
// Web Crypto only, so it works wherever the proxy runs.

export const SESSION_COOKIE = "ms_session";
export const SESSION_DAYS = 30;

/** Auth is on whenever APP_PASSWORD is set. Production refuses to serve without it (see proxy.ts). */
export const authEnabled = () => Boolean(process.env.APP_PASSWORD);

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string) {
  // APP_SECRET signs sessions; falls back to the password so a missing secret still yields unforgeable cookies
  const secret = process.env.APP_SECRET || `pw:${process.env.APP_PASSWORD ?? ""}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** constant-time string comparison */
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSession() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${await hmac(exp)}`;
}

export async function verifySession(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}
