import { resolveTxt } from 'node:dns/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import {
  getOrCreateDomainVerificationToken,
  markDomainVerified,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/domain/verify-ownership';

function isMissingDnsError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['ENODATA', 'ENOTFOUND', 'ENOTIMP', 'ESERVFAIL', 'ETIMEOUT'].includes(String(error.code))
  );
}

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
        scope: 'domain:verify-ownership:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'domain:verify-ownership:ip',
        windowSeconds: 60,
      },
    ]);

    const { account } = payload;
    const domain = account.domain?.trim().toLowerCase();
    if (!domain) {
      return NextResponse.json(
        { error: 'Add your domain in Publishing before verifying.' },
        { status: 400 }
      );
    }

    const token = await getOrCreateDomainVerificationToken(accountId);
    if (!token) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const recordName = `_magnets-verify.${domain}`;
    let found: string[] = [];
    try {
      const raw = await resolveTxt(recordName);
      found = raw.map((parts) => parts.join('').trim());
    } catch (err) {
      if (!isMissingDnsError(err)) {
        log.warn('TXT lookup error', {
          route: ROUTE,
          method: 'POST',
          userId,
          accountId,
          extra: { error: err },
        });
      }
      return NextResponse.json({
        verified: false,
        message: 'No TXT record found yet. DNS can take a few minutes to propagate.',
        expected: { type: 'TXT', name: recordName, value: token },
      });
    }

    if (!found.includes(token)) {
      return NextResponse.json({
        verified: false,
        message:
          found.length > 0
            ? 'Found a TXT record at that host, but the value does not match. Copy the value exactly.'
            : 'No TXT record found yet. DNS can take a few minutes to propagate.',
        expected: { type: 'TXT', name: recordName, value: token },
        found,
      });
    }

    const updated = await markDomainVerified(accountId);
    log.info('Domain ownership verified', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      extra: { domain },
    });

    return NextResponse.json({
      verified: true,
      verifiedAt: updated?.domainVerifiedAt || new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Verify ownership failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Verification check failed' }, { status: 500 });
  }
}
