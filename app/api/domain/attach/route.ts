import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import {
  AccountDomainMutationInProgressError,
  clearDomainAttached,
  getAccountWithSecrets,
  recordDomainAttached,
  withAccountDomainMutationLock,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import {
  attachDomain,
  getDomainConfig,
  isVercelConfigured,
  removeDomain,
  VercelApiError,
} from '@/lib/vercel';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/domain/attach';

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;
    const lockedAccountId = payload.account.id;

    // 1-minute cooldown per user. Attach calls the Vercel domains API and
    // immediately follows with /v6/domains/.../config — both billable / quota'd.
    // One per 60s is fine because retrying instantly never helps.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 1,
        scope: 'domain:attach:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 15,
        scope: 'domain:attach:ip',
        windowSeconds: 60,
      },
    ]);

    return await withAccountDomainMutationLock(lockedAccountId, async () => {
      const account = await getAccountWithSecrets(lockedAccountId);
      if (!account) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }
      if (!account.domain || !account.subdomain) {
        return NextResponse.json(
          { error: 'Set both the root domain and the subdomain in Publishing first.' },
          { status: 400 }
        );
      }
      if (!account.domainVerifiedAt) {
        return NextResponse.json(
          { error: 'Verify ownership with the TXT record before connecting.' },
          { status: 412 }
        );
      }
      if (!isVercelConfigured()) {
        return NextResponse.json(
          { error: 'The publishing host is not configured on the server. Try again later.' },
          { status: 503 }
        );
      }

      const host = `${account.subdomain.toLowerCase()}.${account.domain.toLowerCase()}`;
      if (account.domainAttachedHost && account.domainAttachedHost !== host) {
        try {
          await removeDomain(account.domainAttachedHost);
          await clearDomainAttached(lockedAccountId);
        } catch (detachErr) {
          log.error('Detach blocked replacement domain attach', {
            route: ROUTE,
            method: 'POST',
            status: 502,
            userId,
            accountId,
            extra: { host: account.domainAttachedHost, error: detachErr },
          });
          return NextResponse.json(
            { error: 'We could not remove the previous publishing domain. Try again before connecting a new one.' },
            { status: 502 }
          );
        }
      }

      let reserved;
      try {
        // Claim the hostname before the external call. If Vercel times out after
        // accepting it, this row remains the authoritative cleanup reference.
        reserved = await recordDomainAttached(lockedAccountId, host, '');
      } catch (dbErr) {
        if (typeof dbErr === 'object' && dbErr !== null && 'code' in dbErr && dbErr.code === '23505') {
          return NextResponse.json(
            { error: 'That subdomain is already connected to another account. Pick a different subdomain.' },
            { status: 409 }
          );
        }
        throw dbErr;
      }

      try {
        await attachDomain(host);
      } catch (err) {
        let cleanupConfirmed = false;
        try {
          await removeDomain(host);
          cleanupConfirmed = true;
        } catch (cleanupErr) {
          log.error('Failed to compensate uncertain explicit domain attachment', {
            route: ROUTE,
            method: 'POST',
            userId,
            accountId,
            extra: { host, error: cleanupErr },
          });
        }
        if (cleanupConfirmed) await clearDomainAttached(lockedAccountId);

        let message = 'We could not connect that subdomain right now. Try again in a minute.';
        let status = 502;
        if (err instanceof VercelApiError) {
          status = err.status >= 500 ? 502 : err.status;
          if (err.status === 409 && (err.code === 'domain_already_in_use' || err.code === 'not_available')) {
            message = 'That subdomain is in use by another account. Pick a different subdomain or contact support.';
          } else if (err.status === 403) {
            message = 'We could not connect that subdomain. Contact support if the issue persists.';
          }
        }
        log.warn('Attach failed', {
          route: ROUTE,
          method: 'POST',
          status,
          userId,
          accountId,
          extra: { host, cleanupConfirmed, error: err },
        });
        return NextResponse.json({ error: message }, { status });
      }

      let recommendedCname = '';
      try {
        const config = await getDomainConfig(host);
        recommendedCname = config?.recommendedCname || '';
      } catch (err) {
        log.warn('Could not fetch domain config', {
          route: ROUTE,
          method: 'POST',
          userId,
          accountId,
          extra: { host, error: err },
        });
      }

      const updated = recommendedCname
        ? await recordDomainAttached(lockedAccountId, host, recommendedCname)
        : reserved;

      log.info('Domain attached', {
        route: ROUTE,
        method: 'POST',
        status: 200,
        userId,
        accountId,
        extra: { host, recommendedCname },
      });

      return NextResponse.json({
        attached: true,
        host,
        cnameRecord: recommendedCname
          ? {
              type: 'CNAME',
              name: account.subdomain,
              value: recommendedCname,
              fullName: host,
            }
          : null,
        account: updated,
      });
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
    log.error('Attach failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not connect the subdomain' }, { status: 500 });
  }
}
