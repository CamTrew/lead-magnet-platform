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
import { removeDomain } from '@/lib/vercel';
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

    // Detach the account's hostname from the project before we drop the row so
    // the hostname is reusable by another account in the future. We only ever
    // attach the subdomain (e.g. get.example.com), not the apex.
    const attachedHost = payload.account.domainAttachedHost;
    if (attachedHost) {
      try {
        await removeDomain(attachedHost);
      } catch (detachErr) {
        log.warn('Detach during account delete failed (non-fatal)', {
          route: ROUTE,
          method: 'POST',
          userId,
          accountId,
          extra: { error: detachErr },
        });
      }
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
