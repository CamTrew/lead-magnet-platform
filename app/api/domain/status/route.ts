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
  getDomainConfig,
  getDomainStatus,
  isVercelConfigured,
  VercelApiError,
} from '@/lib/vercel';
import { log } from '@/lib/logger';
import type { DomainStage } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/domain/status';
const PUBLIC_HOST_PROBE_TIMEOUT_MS = 4_000;

type LiveStatus = {
  verified: boolean;
  misconfigured: boolean;
  configured?: boolean;
  issue?: 'deployment_not_found' | 'check_failed' | 'invalid_dns';
};

type DnsRecord = {
  type: string;
  name: string;
  value: string;
  fullName?: string;
  reason?: string;
};

function dnsProviderName(fullName: string, rootDomain: string) {
  const normalizedFullName = fullName.trim().replace(/\.$/, '');
  const normalizedRoot = rootDomain.trim().replace(/\.$/, '');
  if (!normalizedFullName || !normalizedRoot) return normalizedFullName;
  if (normalizedFullName === normalizedRoot) return '@';
  if (normalizedFullName.endsWith(`.${normalizedRoot}`)) {
    return normalizedFullName.slice(0, -normalizedRoot.length - 1);
  }
  return normalizedFullName;
}

function vercelVerificationRecords(
  records: Array<{ type: string; domain: string; value: string; reason?: string }>,
  rootDomain: string
): DnsRecord[] {
  return records
    .filter((record) => record.type && record.domain && record.value)
    .map((record) => ({
      type: record.type.toUpperCase(),
      name: dnsProviderName(record.domain, rootDomain),
      value: record.value,
      fullName: record.domain,
      reason: record.reason,
    }));
}

async function fetchHostHead(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_HOST_PROBE_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: 'no-store',
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probePublicHost(host: string): Promise<LiveStatus | null> {
  if (!host) return null;

  try {
    const httpsResponse = await fetchHostHead(`https://${host}`);
    const httpsVercelError = httpsResponse.headers.get('x-vercel-error')?.toLowerCase();
    if (httpsVercelError === 'deployment_not_found') {
      return {
        verified: false,
        misconfigured: true,
        configured: false,
        issue: 'deployment_not_found',
      };
    }
    if (httpsResponse.headers.get('server')?.toLowerCase().includes('vercel')) {
      return {
        verified: true,
        misconfigured: false,
        configured: true,
      };
    }
  } catch {
    // If HTTPS is not provisioned yet, fall back to plain HTTP. Vercel still
    // tells us whether the host is attached to a deployment there.
  }

  try {
    const httpResponse = await fetchHostHead(`http://${host}`);
    const httpVercelError = httpResponse.headers.get('x-vercel-error')?.toLowerCase();
    if (httpVercelError === 'deployment_not_found') {
      return {
        verified: false,
        misconfigured: true,
        configured: false,
        issue: 'deployment_not_found',
      };
    }
    if (httpResponse.headers.get('server')?.toLowerCase().includes('vercel')) {
      return {
        verified: false,
        misconfigured: false,
        configured: true,
      };
    }
  } catch {
    return null;
  }

  return null;
}

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
        limit: 20,
        scope: 'domain:status:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 60,
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
    let liveStatus: LiveStatus | null = null;
    let platformVerificationRecords: DnsRecord[] = [];
    let recommendedCname = account.domainRecommendedCname;
    if (stage === 'attached-pending' && isVercelConfigured() && account.domainAttachedHost) {
      try {
        const [statusResult, configResult] = await Promise.allSettled([
          getDomainStatus(account.domainAttachedHost),
          getDomainConfig(account.domainAttachedHost),
        ]);

        if (statusResult.status === 'fulfilled') {
          const status = statusResult.value;
          platformVerificationRecords = vercelVerificationRecords(status?.verification || [], domain);
          liveStatus = {
            verified: Boolean(status?.verified),
            misconfigured: false,
            configured: status?.configured,
          };
        } else if (statusResult.reason instanceof VercelApiError) {
          liveStatus = {
            verified: false,
            misconfigured: false,
            issue: 'check_failed',
          };
          log.warn('Status poll failed', {
            route: ROUTE,
            method: 'GET',
            userId,
            accountId,
            extra: { code: statusResult.reason.code, status: statusResult.reason.status },
          });
        } else {
          throw statusResult.reason;
        }

        if (configResult.status === 'fulfilled') {
          const config = configResult.value;
          recommendedCname = config?.recommendedCname || recommendedCname;

          if (config?.misconfigured) {
            liveStatus = {
              ...(liveStatus || { verified: false }),
              verified: false,
              misconfigured: true,
              configured: false,
              issue: 'invalid_dns',
            };
          } else if (config?.configuredBy) {
            liveStatus = {
              ...(liveStatus || { verified: false }),
              misconfigured: false,
              configured: true,
            };
          }
        } else if (configResult.reason instanceof VercelApiError) {
          liveStatus = liveStatus || {
            verified: false,
            misconfigured: false,
            issue: 'check_failed',
          };
          log.warn('Config poll failed', {
            route: ROUTE,
            method: 'GET',
            userId,
            accountId,
            extra: { code: configResult.reason.code, status: configResult.reason.status },
          });
        } else {
          throw configResult.reason;
        }
      } catch (err) {
        if (err instanceof VercelApiError) {
          liveStatus = {
            verified: false,
            misconfigured: false,
            issue: 'check_failed',
          };
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

    if (stage === 'attached-pending' && account.domainAttachedHost && liveStatus?.issue !== 'invalid_dns') {
      const publicStatus = await probePublicHost(account.domainAttachedHost);
      if (publicStatus?.verified) {
        stage = 'live';
        liveStatus = publicStatus;
      } else if (publicStatus?.issue === 'deployment_not_found') {
        liveStatus = publicStatus;
      } else if (!liveStatus && publicStatus) {
        liveStatus = publicStatus;
      }
    }

    return NextResponse.json({
      stage,
      host,
      verificationRecord: token
        ? {
            type: 'TXT',
            // Bare label is what DNS providers' Host fields expect (Namecheap
            // in particular rewrites or rejects fully-qualified hosts). The
            // resolver on the server side reconstructs the FQDN.
            name: 'magnets-verify',
            value: token,
            fullName: `magnets-verify.${domain}`,
          }
        : null,
      cnameRecord: account.domainAttachedHost && recommendedCname
        ? {
            type: 'CNAME',
            name: subdomain,
            value: recommendedCname,
            fullName: account.domainAttachedHost,
          }
        : null,
      liveStatus,
      platformVerificationRecords,
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
