import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { getPasswordHashForUser, updateUserPasswordHash } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/account/password';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
}).strict();

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 5,
        scope: 'account:password:user',
        windowSeconds: 15 * 60,
      },
      {
        identifier: requestIp(request),
        limit: 20,
        scope: 'account:password:ip',
        windowSeconds: 15 * 60,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the password fields and try again.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const storedHash = await getPasswordHashForUser(payload.user.id);
    if (!storedHash) {
      return NextResponse.json({ error: 'No password set on this account.' }, { status: 409 });
    }

    const currentMatches = await verifyPassword(parsed.data.currentPassword, storedHash);
    if (!currentMatches) {
      log.warn('Password change rejected: wrong current password', {
        route: ROUTE,
        method: 'POST',
        status: 401,
        userId,
      });
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return NextResponse.json(
        { error: 'New password must be different from the current one.' },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await updateUserPasswordHash(payload.user.id, newHash);

    log.info('Password changed', { route: ROUTE, method: 'POST', status: 200, userId });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Password change failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not change password' }, { status: 500 });
  }
}
