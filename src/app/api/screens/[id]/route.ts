import { z } from "zod";
import { deleteScreen, updateScreen } from "@/lib/saved";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteScreen(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH { alerts_enabled } -> toggle alerts. Turning alerts on resets the baseline so the first run only records matches.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ alerts_enabled: z.boolean() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    await updateScreen(id, { alerts_enabled: parsed.data.alerts_enabled, last_matches: null });
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
