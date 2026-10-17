// Liveness check for the host (no auth, no data).
export function GET() {
  return Response.json({ ok: true });
}
