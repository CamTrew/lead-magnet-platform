import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { clearSession, requireDashboardPayload } from '@/lib/auth';
import { verifyPassword } from '@/lib/passwords';
import {
  AccountDomainMutationInProgressError,
  deleteUserAndAccount,
  getAccountWithSecrets,
  getPasswordHashForUser,
  withAccountDomainMutationLock,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { isVercelConfigured, removeDomain } from '@/lib/vercel';
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

    return await withAccountDomainMutationLock(payload.account.id, async () => {
      const currentAccount = await getAccountWithSecrets(payload.account.id);
      if (!currentAccount) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }

      // Deletion is deliberately blocked when cleanup cannot be confirmed. If
      // we deleted the row anyway, the only reference to the billable Vercel
      // hostname would be lost and it could remain attached indefinitely.
      const attachedHost = currentAccount.domainAttachedHost;
      if (attachedHost) {
        if (!isVercelConfigured()) {
          return NextResponse.json(
            { error: 'We could not remove your publishing domain. Try again or contact support.' },
            { status: 503 }
          );
        }
        try {
          await removeDomain(attachedHost);
        } catch (detachErr) {
          log.error('Detach blocked account deletion', {
            route: ROUTE,
            method: 'POST',
            status: 502,
            userId,
            accountId,
            extra: { host: attachedHost, error: detachErr },
          });
          return NextResponse.json(
            { error: 'We could not remove your publishing domain, so the account was not deleted. Try again.' },
            { status: 502 }
          );
        }
      }

      await deleteUserAndAccount(payload.user.id);
      await clearSession();

      log.info('Account deleted', { route: ROUTE, method: 'POST', status: 200, userId, accountId });
      return NextResponse.json({ success: true });
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    if (err instanceof AccountDomainMutationInProgressError) {
      return NextResponse.json(
        { error: 'Another domain change is already in progress. Wait a moment and try again.' },
        { status: 409 }
      );
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
