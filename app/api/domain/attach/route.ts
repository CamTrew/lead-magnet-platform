import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { recordDomainAttached } from '@/lib/platform-store';
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

    // 2-minute cooldown per user. Attach calls the Vercel domains API and
    // immediately follows with /v6/domains/.../config — both billable / quota'd.
    // One per 120s is fine because retrying instantly never helps.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 1,
        scope: 'domain:attach:user',
        windowSeconds: 120,
      },
      {
        identifier: requestIp(request),
        limit: 15,
        scope: 'domain:attach:ip',
        windowSeconds: 120,
      },
    ]);

    const { account } = payload;
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

    try {
      await attachDomain(host);
    } catch (err) {
      if (err instanceof VercelApiError) {
        // Don't leak Vercel-flavored errors to the user; map a few known cases.
        let message = 'We could not connect that subdomain right now. Try again in a minute.';
        if (err.status === 409 && (err.code === 'domain_already_in_use' || err.code === 'not_available')) {
          message =
            'That subdomain is in use by another account. Pick a different subdomain or contact support.';
        } else if (err.status === 403) {
          message = 'We could not connect that subdomain. Contact support if the issue persists.';
        }
        log.warn('Attach failed', {
          route: ROUTE,
          method: 'POST',
          status: err.status,
          userId,
          accountId,
          extra: { host, code: err.code },
        });
        return NextResponse.json({ error: message }, { status: err.status >= 500 ? 502 : err.status });
      }
      throw err;
    }

    let recommendedCname = '';
    try {
      const config = await getDomainConfig(host);
      recommendedCname = config?.recommendedCname || '';
    } catch (err) {
      // Falling back to the generic value isn't useful, so we leave the
      // recommendedCname empty and the UI tells the user we're still resolving
      // the right target. The status endpoint will retry on the next poll.
      log.warn('Could not fetch domain config', {
        route: ROUTE,
        method: 'POST',
        userId,
        accountId,
        extra: { host, error: err },
      });
    }

    let updated;
    try {
      updated = await recordDomainAttached(accountId, host, recommendedCname);
    } catch (dbErr) {
      // 23505 = postgres unique violation. magnets_accounts_attached_host_unique
      // ensures no two accounts can hold the same attached host at once.
      if (typeof dbErr === 'object' && dbErr !== null && 'code' in dbErr && dbErr.code === '23505') {
        log.warn('Attach blocked by host uniqueness', {
          route: ROUTE,
          method: 'POST',
          status: 409,
          userId,
          accountId,
          extra: { host },
        });
        return NextResponse.json(
          {
            error:
              'That subdomain is already connected to another account. Pick a different subdomain or contact support.',
          },
          { status: 409 }
        );
      }
      throw dbErr;
    }

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
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
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
