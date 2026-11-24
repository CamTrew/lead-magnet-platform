import { z } from "zod";
import { getCurrentDashboardBase } from "@/lib/auth";
import { assistantEnabled } from "@/lib/assistant-auth";
import {
  listAssistantGrants,
  revokeAssistantGrant,
} from "@/lib/platform-store";
export async function GET() {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  return Response.json({
    connections: await listAssistantGrants(payload.account.id),
  });
}
export async function DELETE(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  const parsed = z
    .object({ id: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  await revokeAssistantGrant(payload.account.id, parsed.data.id);
  return Response.json({ revoked: true });
}
