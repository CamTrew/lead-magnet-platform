import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthActionError, completePasswordReset } from '@/lib/auth';
import { log } from '@/lib/logger';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z
  .object({
    token: z.string().trim().min(32).max(512),
    password: z.string().min(8).max(256),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Choose a password with at least 8 characters.' },
        { status: 400 }
      );
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 12,
        scope: 'auth:password-reset-confirm:ip',
        windowSeconds: 15 * 60,
      },
    ]);

    await completePasswordReset(parsed.data.token, parsed.data.password);
    return NextResponse.json({ message: 'Your password has been updated.' });
  } catch (error) {
    if (error instanceof AuthActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RateLimitError) return rateLimitResponse(error);

    log.error('Password reset could not be completed', {
      route: '/api/auth/password-reset/confirm',
      method: 'POST',
      status: 500,
      extra: { error },
    });

    return NextResponse.json(
      { error: 'We could not update your password right now. Please request another link.' },
      { status: 500 }
    );
  }
}
