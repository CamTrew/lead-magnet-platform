import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { readAssistantBody } from '@/lib/assistant-request';
import { saveCreationRequest, getCreationRequest, getCreationBrand } from '@/lib/platform-store';
import { enforceRateLimits, RateLimitError, rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  try {
    const input = z.object({ brief: z.string().trim().min(1).max(1200),
      format: z.enum(['checklist', 'cheat-sheet', 'worksheet', 'guide', 'templates']) }).strict()
      .parse(JSON.parse(await readAssistantBody(request, 6000)));
    await enforceRateLimits([{ scope: 'campaign:brief', identifier: payload.account.id, limit: 40, windowSeconds: 3600 }]);
    const savedBrief = await saveCreationRequest(payload.account.id, input.brief, input.format);
    return Response.json({ savedBrief }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: 'Add an idea of up to 1,200 characters.' }, { status: 400 });
    log.warn('Could not save creation brief', { route: '/api/campaigns/brief', extra: { error } });
    return Response.json({ error: 'Could not save your idea. Please retry.' }, { status: 500 });
  }
}

export async function GET() {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  const [savedBrief, brand] = await Promise.all([
    getCreationRequest(payload.account.id), getCreationBrand(payload.account.id),
  ]);
  return Response.json({ savedBrief, brand }, { headers: { 'Cache-Control': 'no-store' } });
}
