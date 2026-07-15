import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPasswordReset } from '@/lib/auth';
import { log } from '@/lib/logger';
import { sendPasswordResetEmail } from '@/lib/resend';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

const genericSuccess = {
  message: 'If an account exists for that email, we have sent a password reset link.',
};

function resetUrl(request: NextRequest, token: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const baseUrl = configuredSiteUrl || (
    process.env.NODE_ENV === 'production' ? 'https://magnets.so' : request.nextUrl.origin
  );
  const url = new URL('/reset-password', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 10,
        scope: 'auth:password-reset:ip',
        windowSeconds: 60 * 60,
      },
      {
        identifier: email,
        limit: 3,
        scope: 'auth:password-reset:email',
        windowSeconds: 60 * 60,
      },
    ]);

    const reset = await createPasswordReset(email);
    if (!reset) return NextResponse.json(genericSuccess);

    try {
      await sendPasswordResetEmail({
        to: reset.email,
        resetUrl: resetUrl(request, reset.token),
      });
    } catch (error) {
      // Do not reveal delivery failures or account existence to an unauthenticated
      // visitor. The error is retained in structured logs for support.
      log.error('Password reset email could not be sent', {
        route: '/api/auth/password-reset/request',
        method: 'POST',
        status: 202,
        userId: undefined,
        extra: { error },
      });
    }

    return NextResponse.json(genericSuccess);
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }
}
