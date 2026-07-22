import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthActionError, completeEmailVerification } from '@/lib/auth';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z.object({
  token: z.string().trim().min(20).max(256),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'This verification link is invalid.' }, { status: 400 });
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 20,
        scope: 'auth:email-verification:confirm:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    await completeEmailVerification(parsed.data.token);
    return NextResponse.json({ verified: true });
  } catch (error) {
    if (error instanceof AuthActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }
}
