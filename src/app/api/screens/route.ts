import { z } from "zod";
import { ScreenSpec } from "@/lib/screen";
import { createScreen, listScreens } from "@/lib/saved";

const Body = z.object({ name: z.string().trim().min(1).max(80), spec: ScreenSpec });

export async function GET() {
  try {
    return Response.json(await listScreens());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return Response.json(await createScreen(parsed.data.name, { ...parsed.data.spec, page: 0 }), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
