import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  aiUsageLimitResponse,
  enforceAiUsageLimit,
  isAiUsageLimitError,
} from '@/lib/ai-usage';
import { generateLeadMagnetCopy, LeadMagnetAiError } from '@/lib/lead-magnet-ai';
import { log } from '@/lib/logger';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const ROUTE = '/api/lead-magnets/generate';

const schema = z.object({
  brief: z.string().trim().min(40, 'Add a little more detail so the draft has something real to work with.').max(12_000),
}).strict();

export async function POST(request: Request) {
  const start = Date.now();
  let userId: string | undefined;
  let accountId: string | undefined;

  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: userId,
        limit: 12,
        scope: 'lead-magnets:ai-generate:user',
        windowSeconds: 60 * 60,
      },
      {
        identifier: requestIp(request as Parameters<typeof requestIp>[0]),
        limit: 24,
        scope: 'lead-magnets:ai-generate:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Add some detail and try again.' },
        { status: 400 }
      );
    }

    await enforceAiUsageLimit(accountId, 'draft');
    const draft = await generateLeadMagnetCopy({
      account: payload.account,
      brief: parsed.data.brief,
    });

    log.info('Lead magnet AI draft generated', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({ draft });
  } catch (error) {
    if (isAiUsageLimitError(error)) return aiUsageLimitResponse(error);
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof LeadMagnetAiError) {
      log.warn('Lead magnet AI draft failed', {
        route: ROUTE,
        method: 'POST',
        status: error.status,
        userId,
        accountId,
        extra: { error },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    log.error('Lead magnet AI draft failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error },
    });
    return NextResponse.json({ error: 'Could not write a draft right now. Please try again.' }, { status: 500 });
  }
}
