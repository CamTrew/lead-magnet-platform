import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 20,
        scope: 'vercel:status:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'vercel:status:ip',
        windowSeconds: 60,
      },
    ]);

    if (!isVercelConfigured()) {
      return NextResponse.json({ configured: false });
    }

    const url = new URL(request.url);
    const host = url.searchParams.get('host')?.trim().toLowerCase();
    if (!host || !host.includes('.')) {
      return NextResponse.json({ error: 'Pass ?host=' }, { status: 400 });
    }

    const configuredHost = payload.account.domain && payload.account.subdomain
      ? `${payload.account.subdomain}.${payload.account.domain}`.toLowerCase()
      : '';
    const allowedHosts = new Set<string>();
    if (configuredHost) allowedHosts.add(configuredHost);
    if (payload.account.domainAttachedHost) {
      allowedHosts.add(payload.account.domainAttachedHost.toLowerCase());
    }
    if (!allowedHosts.has(host)) {
      return NextResponse.json({ error: 'Publishing domain not found' }, { status: 404 });
    }

    const status = await getDomainStatus(host);
    return NextResponse.json({ configured: true, host, status });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    if (err instanceof VercelApiError) {
      const message = err.status === 429
        ? 'Publishing status is busy right now. Try again in a minute.'
        : 'Could not check publishing status right now. Try again in a minute.';
      return NextResponse.json(
        { error: message },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    throw err;
  }
}
