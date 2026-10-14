import { z } from "zod";
import { listAlerts, markSeen } from "@/lib/alerts";

export async function GET() {
  try {
    return Response.json(await listAlerts());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { ids?: string[] } -> mark seen (all if ids omitted)
export async function POST(request: Request) {
  const parsed = z.object({ ids: z.array(z.string()).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    await markSeen(parsed.data.ids);
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
