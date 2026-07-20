import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { recordPostSignupVideoPlay } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const ROUTE = '/api/analytics/video-play';
const schema = z.object({
  leadMagnetId: z.string().uuid(),
  submissionId: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid video event' }, { status: 400 });
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 80,
        scope: 'analytics:video-play:ip',
        windowSeconds: 15 * 60,
      },
      {
        identifier: `${parsed.data.leadMagnetId}:${parsed.data.submissionId}`,
        limit: 10,
        scope: 'analytics:video-play:submission',
        windowSeconds: 60 * 60,
      },
    ]);

    const recorded = await recordPostSignupVideoPlay(parsed.data);
    return recorded
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'Video experience not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.warn('Post-signup video play failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      extra: { error },
    });
    return NextResponse.json({ error: 'Video play could not be recorded' }, { status: 500 });
  }
}
