import { z } from "zod";
import { getCurrentDashboardBase } from "@/lib/auth";
import { assistantEnabled } from "@/lib/assistant-auth";
import { publishCampaign } from "@/lib/campaign-service";
import {
  enforceRateLimits,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { log } from "@/lib/logger";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 400 });
  try {
    await enforceRateLimits([
      {
        scope: "campaign:publish",
        identifier: payload.account.id,
        limit: 20,
        windowSeconds: 3600,
      },
    ]);
    return Response.json(await publishCampaign(payload.account.id, id));
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.warn("Campaign publish failed", {
      route: "/api/campaigns/[id]/publish",
      accountId: payload.account.id,
      extra: { error },
    });
    return Response.json(
      {
        error:
          "Publishing could not finish. Check your Magnets username and email delivery settings, then retry. Your draft is saved.",
      },
      { status: 409 },
    );
  }
}
