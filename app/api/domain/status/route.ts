import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { getOrCreateDomainVerificationToken } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import {
  getDomainStatus,
  isVercelConfigured,
  VercelApiError,
} from '@/lib/vercel';
import { log } from '@/lib/logger';
import type { DomainStage } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/domain/status';

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
        scope: 'domain:status:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 240,
        scope: 'domain:status:ip',
        windowSeconds: 60,
      },
    ]);

    const { account } = payload;
    const subdomain = account.subdomain?.trim();
    const domain = account.domain?.trim();
    const host = subdomain && domain ? `${subdomain}.${domain}` : '';

    let stage: DomainStage = 'no-domain';
    if (!domain) stage = 'no-domain';
    else if (!account.domainVerifiedAt) stage = 'unverified';
    else if (!account.domainAttachedHost) stage = 'verified';
    else stage = 'attached-pending';

    // Mint or look up the ownership token. The first call sets it.
    let token = '';
    if (domain) {
      token = (await getOrCreateDomainVerificationToken(accountId)) || '';
    }

    // If we believe the domain is attached, ask the host whether it's actually
    // serving traffic. That flips us from attached-pending to live.
    let liveStatus: { verified: boolean; misconfigured: boolean } | null = null;
    if (stage === 'attached-pending' && isVercelConfigured() && account.domainAttachedHost) {
      try {
        const status = await getDomainStatus(account.domainAttachedHost);
        if (status?.verified) {
          stage = 'live';
        }
        liveStatus = {
          verified: Boolean(status?.verified),
          misconfigured: false,
        };
      } catch (err) {
        if (err instanceof VercelApiError) {
          log.warn('Status poll failed', {
            route: ROUTE,
            method: 'GET',
            userId,
            accountId,
            extra: { code: err.code, status: err.status },
          });
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      stage,
      host,
      verificationRecord: token
        ? {
            type: 'TXT',
            name: `magnets-verify.${domain}`,
            value: token,
          }
        : null,
      cnameRecord: account.domainAttachedHost && account.domainRecommendedCname
        ? {
            type: 'CNAME',
            name: subdomain,
            value: account.domainRecommendedCname,
            fullName: account.domainAttachedHost,
          }
        : null,
      liveStatus,
      attachedHost: account.domainAttachedHost,
      verifiedAt: account.domainVerifiedAt,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Domain status failed', {
      route: ROUTE,
      method: 'GET',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not load domain status' }, { status: 500 });
  }
}
