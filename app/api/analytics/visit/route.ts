import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { recordLeadMagnetVisit } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const ROUTE = '/api/analytics/visit';
// AI/MAINTAINER CONTEXT: this endpoint is public because landing-page visitors
// do not have dashboard sessions. The random session id is analytics identity,
// not authentication; schema bounds + both rate limits are the abuse boundary.
const schema = z.object({
  leadMagnetId: z.string().uuid(),
  sessionId: z.string().uuid(),
  engagedSeconds: z.number().int().min(0).max(21600),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid analytics event' }, { status: 400 });
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 600,
        scope: 'analytics:visit:ip',
        windowSeconds: 15 * 60,
      },
      {
        identifier: `${parsed.data.leadMagnetId}:${parsed.data.sessionId}`,
        limit: 90,
        scope: 'analytics:visit:session',
        windowSeconds: 60 * 60,
      },
    ]);

    const recorded = await recordLeadMagnetVisit(parsed.data);
    return recorded
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.warn('Lead magnet analytics event failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      extra: { error },
    });
    return NextResponse.json({ error: 'Analytics event could not be recorded' }, { status: 500 });
  }
}
