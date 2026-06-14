import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { updateUserName } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/account/profile';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120, 'Name is too long'),
}).strict();

export async function PUT(request: NextRequest) {
  let userId: string | undefined;

  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 30,
        scope: 'account:profile:user',
        windowSeconds: 15 * 60,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'account:profile:ip',
        windowSeconds: 15 * 60,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check your name and try again.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const user = await updateUserName(payload.user.id, parsed.data.name);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    log.info('Profile updated', { route: ROUTE, method: 'PUT', status: 200, userId });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    log.error('Profile update failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      userId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not update profile' }, { status: 500 });
  }
}
