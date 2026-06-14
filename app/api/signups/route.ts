import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { deleteAccountSignup, listAccountSignups } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

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

export async function DELETE(request: NextRequest) {
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
        scope: 'signups:delete:user',
        windowSeconds: 60 * 10,
      },
      {
        identifier: requestIp(request),
        limit: 120,
        scope: 'signups:delete:ip',
        windowSeconds: 60 * 10,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const deleted = await deleteAccountSignup(payload.account.id, parsed.data.email);

    log.info('Signup removed', {
      route: '/api/signups',
      method: 'DELETE',
      status: 200,
      userId,
      accountId,
      extra: { deleted },
    });

    return NextResponse.json({ deleted });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Signup delete failed', {
      route: '/api/signups',
      method: 'DELETE',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not remove signup' }, { status: 500 });
  }
}
