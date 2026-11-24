import { LeadMagnetCreationLimitError, leadMagnetCreationLimitResponse } from '@/lib/lead-magnet-creation-limit';
import { readAssistantBody } from "@/lib/assistant-request";
import { z } from "zod";
import { getCurrentDashboardBase } from "@/lib/auth";
import { assistantEnabled, assistantOrigin } from "@/lib/assistant-auth";
import { listCampaigns } from "@/lib/platform-store";
import { createAndPublishCampaign, campaignLinks } from "@/lib/campaign-service";
import { validateCampaignPackage } from "@/lib/campaign-schema";
import {
  enforceRateLimits,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
export async function GET() {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  return Response.json(
    { campaigns: await listCampaigns(payload.account.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  try {
    await enforceRateLimits([
      {
        scope: "campaign:import",
        identifier: payload.account.id,
        limit: 20,
        windowSeconds: 3600,
      },
    ]);
    const input = z
      .object({
        requestId: z.string().min(8).max(100),
        brief: z.string().max(1200),
        campaign: z.unknown(),
        followUpsRequested: z.boolean().default(false),
      })
      .strict()
      .parse(JSON.parse(await readAssistantBody(request, 500000)));
    const { campaign, publicationError } = await createAndPublishCampaign(
      payload.account.id,
      input.requestId,
      input.brief,
      validateCampaignPackage(input.campaign),
      assistantOrigin(),
      { followUpsRequested: input.followUpsRequested },
    );
    return Response.json({ campaign: { ...campaign, cover_data: undefined }, publicationError, ...await campaignLinks(payload.account.id, campaign, assistantOrigin()) });
  } catch (error) {
    if (error instanceof LeadMagnetCreationLimitError) return leadMagnetCreationLimitResponse(error);
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "The campaign is incomplete. Ask your assistant for the complete JSON package."
            : error instanceof Error &&
                (error.message.startsWith("Revise the copy") || error.message.startsWith("Only add follow-ups"))
              ? error.message
              : "The campaign could not be saved. Your draft is still here.",
      },
      { status: 400 },
    );
  }
}
