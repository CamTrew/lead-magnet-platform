import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { listAccountSignups } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 120,
        scope: 'signups:list:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 240,
        scope: 'signups:list:ip',
        windowSeconds: 60,
      },
    ]);

    const signups = await listAccountSignups(payload.account.id);
    return NextResponse.json({ signups });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Signups list failed', {
      route: '/api/signups',
      method: 'GET',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not load signups' }, { status: 500 });
  }
}
