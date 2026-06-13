import { NextResponse, type NextRequest } from 'next/server';
import { clearSession } from '@/lib/auth';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'auth:logout:ip',
        windowSeconds: 60,
      },
    ]);

    await clearSession();
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    throw err;
  }
}
