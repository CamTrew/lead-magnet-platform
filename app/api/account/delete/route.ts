import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { clearSession, requireDashboardPayload } from '@/lib/auth';
import { verifyPassword } from '@/lib/passwords';
import { deleteUserAndAccount, getPasswordHashForUser } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { syncProjectDomain } from '@/lib/vercel';
import { log } from '@/lib/logger';

const ROUTE = '/api/account/delete';

const schema = z.object({
  password: z.string().min(1, 'Confirm your password to delete the account.'),
  confirm: z.literal('DELETE'),
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
        limit: 3,
        scope: 'account:delete:user',
        windowSeconds: 60 * 60,
      },
      {
        identifier: requestIp(request),
        limit: 10,
        scope: 'account:delete:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Confirm with your password and the word DELETE.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const storedHash = await getPasswordHashForUser(payload.user.id);
    if (!storedHash) {
      return NextResponse.json({ error: 'No password set on this account.' }, { status: 409 });
    }

    const matches = await verifyPassword(parsed.data.password, storedHash);
    if (!matches) {
      log.warn('Account delete rejected: wrong password', {
        route: ROUTE,
        method: 'POST',
        status: 401,
        userId,
        accountId,
      });
      return NextResponse.json({ error: 'Password is incorrect.' }, { status: 401 });
    }

    // Detach the account's domains from Vercel before we drop the row so the
    // hostnames are reusable by another account in the future.
    const previousHosts = [
      payload.account.subdomain && payload.account.domain
        ? `${payload.account.subdomain}.${payload.account.domain}`
        : '',
      payload.account.domain,
    ].filter(Boolean);
    try {
      await syncProjectDomain({ previous: previousHosts, current: [] });
    } catch (vercelErr) {
      log.warn('Vercel detach during account delete failed (non-fatal)', {
        route: ROUTE,
        method: 'POST',
        userId,
        accountId,
        extra: { error: vercelErr },
      });
    }

    await deleteUserAndAccount(payload.user.id);
    await clearSession();

    log.info('Account deleted', { route: ROUTE, method: 'POST', status: 200, userId, accountId });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Account delete failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 });
  }
}
