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
        limit: 60,
        scope: 'vercel:status:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 120,
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

    const status = await getDomainStatus(host);
    return NextResponse.json({ configured: true, host, status });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    if (err instanceof VercelApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    throw err;
  }
}
