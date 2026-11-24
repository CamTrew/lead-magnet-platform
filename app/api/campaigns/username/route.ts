import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { readAssistantBody } from '@/lib/assistant-request';
import { completeOnboarding } from '@/lib/platform-store';
import { normalisePlatformUsername, isValidNewPlatformUsername, PlatformUsernameUnavailableError } from '@/lib/platform-username';
import { enforceRateLimits, RateLimitError, rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const schema = z.object({ username: z.string().max(40).transform(normalisePlatformUsername)
  .refine(isValidNewPlatformUsername, 'Choose 3 to 40 letters, numbers or hyphens. This name may also be reserved.') }).strict();

export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  try {
    await enforceRateLimits([{ scope: 'campaign:username', identifier: payload.account.id, limit: 20, windowSeconds: 600 }]);
    const input = schema.parse(JSON.parse(await readAssistantBody(request, 1000)));
    const account = await completeOnboarding(payload.account.id, {
      username: input.username,
      businessName: (payload.account.logoText || payload.user.name || 'My magnets').slice(0, 80),
      businessType: '', magnetType: '', cadence: '',
    });
    if (!account) return Response.json({ error: 'Account not found.' }, { status: 404 });
    return Response.json({ username: account.username }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof PlatformUsernameUnavailableError)
      return Response.json({ error: error.message, code: 'username_unavailable' }, { status: 409 });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: error instanceof z.ZodError ? error.issues[0].message : 'Enter your preferred Magnets URL.' }, { status: 400 });
    log.warn('Could not reserve creator URL', { route: '/api/campaigns/username', accountId: payload.account.id, extra: { error } });
    return Response.json({ error: 'Could not save your URL. Please try again.' }, { status: 500 });
  }
}
