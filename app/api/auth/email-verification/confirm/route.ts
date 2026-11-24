import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthActionError, completeEmailVerification, completeEmailVerificationCode } from '@/lib/auth';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z.union([
  z.object({ token: z.string().trim().min(20).max(256) }).strict(),
  z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    code: z.string().regex(/^\d{6}$/),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter the six-digit code from your email.' }, { status: 400 });
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 20,
        scope: 'auth:email-verification:confirm:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    if ('code' in parsed.data) {
      // Address-scoped limits apply across IPs and cannot be reset by resending.
      await enforceRateLimits([{
        identifier: parsed.data.email,
        limit: 5,
        scope: 'auth:email-verification:confirm:email',
        windowSeconds: 10 * 60,
      }]);
      await completeEmailVerificationCode(parsed.data.email, parsed.data.code);
    } else {
      await completeEmailVerification(parsed.data.token);
    }
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
