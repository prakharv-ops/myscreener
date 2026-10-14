import { ScreenSpec } from "@/lib/screen";
import { runScreen } from "@/lib/run-screen";

export async function POST(request: Request) {
  const parsed = ScreenSpec.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return Response.json(await runScreen(parsed.data));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
