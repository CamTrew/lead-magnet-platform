import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { probeApexDmarc, probeSubdomains } from '@/lib/dns-collision';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/delivery/suggest';

export async function GET(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    // Light limit — this is a probe with no external write side effects.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 6,
        scope: 'delivery:suggest:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'delivery:suggest:ip',
        windowSeconds: 60,
      },
    ]);

    const url = new URL(request.url);
    const domain = (url.searchParams.get('domain') || payload.account.domain || '').trim().toLowerCase();
    if (!domain) {
      return NextResponse.json({ error: 'Add a root domain in Publishing first.' }, { status: 400 });
    }
    if (domain !== payload.account.domain?.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Save this root domain before checking it.' }, { status: 400 });
    }

    const [subdomainsRaw, dmarcRecords] = await Promise.all([
      probeSubdomains(domain),
      probeApexDmarc(domain),
    ]);

    // First clear label wins. If none are clear (very rare), we surface them
    // all and let the user decide.
    const recommended = subdomainsRaw.find((s) => s.clear) || null;

    return NextResponse.json({
      domain,
      candidates: subdomainsRaw,
      recommended: recommended?.label || null,
      existingDmarc: dmarcRecords,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Delivery suggest failed', {
      route: ROUTE,
      method: 'GET',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not probe DNS' }, { status: 500 });
  }
}
