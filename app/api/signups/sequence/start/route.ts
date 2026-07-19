import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { startLeadMagnetFollowUpSequence } from '@/lib/follow-up-sequences';
import { findLeadMagnet } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/signups/sequence/start';

const schema = z.object({
  email: z.string().trim().email().max(254),
  leadMagnetId: z.string().uuid(),
  name: z.string().trim().max(120),
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
        limit: 30,
        scope: 'signups:sequence-start:user',
        windowSeconds: 60 * 10,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'signups:sequence-start:ip',
        windowSeconds: 60 * 10,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid signup and lead magnet.' }, { status: 400 });
    }

    const lookup = await findLeadMagnet(payload.account.id, parsed.data.leadMagnetId);
    if (!lookup) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    const started = await startLeadMagnetFollowUpSequence({
      account: lookup.account,
      magnet: lookup.leadMagnet,
      email: parsed.data.email,
      name: parsed.data.name,
    });

    if (!started.started && started.reason === 'not_configured') {
      return NextResponse.json(
        { error: 'This sequence is not ready. Open the magnet, check the sequence, and save it first.' },
        { status: 409 }
      );
    }

    log.info('Follow-up sequence manually started', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      extra: {
        leadMagnetId: parsed.data.leadMagnetId,
        duplicate: started.reason === 'duplicate',
      },
    });

    return NextResponse.json({ started: started.started, alreadyActive: started.reason === 'duplicate' });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    log.error('Follow-up sequence manual start failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not start sequence. Please try again.' }, { status: 502 });
  }
}
