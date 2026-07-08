import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { stopLeadMagnetFollowUpSequence } from '@/lib/follow-up-sequences';
import { findLeadMagnet } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/signups/sequence/stop';

const schema = z.object({
  email: z.string().trim().email().max(254),
  leadMagnetId: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;

  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 60,
        scope: 'signups:sequence-stop:user',
        windowSeconds: 60 * 10,
      },
      {
        identifier: requestIp(request),
        limit: 120,
        scope: 'signups:sequence-stop:ip',
        windowSeconds: 60 * 10,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email and lead magnet.' }, { status: 400 });
    }

    const lookup = await findLeadMagnet(payload.account.id, parsed.data.leadMagnetId);
    if (!lookup) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    const stopped = await stopLeadMagnetFollowUpSequence({
      account: lookup.account,
      leadMagnetId: parsed.data.leadMagnetId,
      email: parsed.data.email,
      reason: 'manual',
    });

    log.info('Follow-up sequence manually stopped', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      extra: { leadMagnetId: parsed.data.leadMagnetId, stopped: stopped.stopped },
    });

    return NextResponse.json({ stopped: stopped.stopped });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    log.error('Follow-up sequence stop failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not stop sequence' }, { status: 500 });
  }
}
