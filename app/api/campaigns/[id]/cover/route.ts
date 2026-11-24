import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { readAssistantBody } from '@/lib/assistant-request';
import { attachCampaignCover } from '@/lib/campaign-cover';
import { getCampaign } from '@/lib/platform-store';
import { enforceRateLimits, RateLimitError, rateLimitResponse } from '@/lib/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response(null, { status: 404 });
  if (!await getCampaign(payload.account.id, id)) return new Response(null, { status: 404 });
  try {
    await enforceRateLimits([{ scope: 'campaign:cover', identifier: payload.account.id, limit: 30, windowSeconds: 3600 }]);
    const { imageBase64 } = z.object({ imageBase64: z.string().min(1).max(1400000) }).strict()
      .parse(JSON.parse(await readAssistantBody(request, 1500000)));
    await attachCampaignCover(payload.account.id, id, imageBase64);
    return Response.json({ attached: true });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return Response.json({ error: 'Could not attach that image. Use a PNG, JPG or WebP under 1 MB on an unpublished draft.' }, { status: 400 });
  }
}
