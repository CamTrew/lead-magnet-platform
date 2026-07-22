import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createEmailVerificationForAddress } from '@/lib/auth';
import { log } from '@/lib/logger';
import { sendEmailVerificationEmail } from '@/lib/resend';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
}).strict();

const genericSuccess = {
  message: 'If that account still needs verification, we have sent a new link.',
};

function verificationUrl(request: NextRequest, token: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const baseUrl = configuredSiteUrl || (
    process.env.NODE_ENV === 'production' ? 'https://magnets.so' : request.nextUrl.origin
  );
  const url = new URL('/verify-email/confirm', baseUrl);
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

    const email = parsed.data.email;
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 10,
        scope: 'auth:email-verification:resend:ip',
        windowSeconds: 60 * 60,
      },
      {
        identifier: email,
        limit: 3,
        scope: 'auth:email-verification:resend:email',
        windowSeconds: 60 * 60,
      },
    ]);

    const verification = await createEmailVerificationForAddress(email);
    if (!verification) return NextResponse.json(genericSuccess);

    try {
      await sendEmailVerificationEmail({
        to: verification.email,
        verificationUrl: verificationUrl(request, verification.token),
      });
    } catch (error) {
      // Keep the response generic so this endpoint cannot reveal whether an
      // account exists. Operations still get the provider failure in logs.
      log.error('Verification email resend failed', {
        route: '/api/auth/email-verification/resend',
        method: 'POST',
        status: 202,
        extra: { error },
      });
    }

    return NextResponse.json(genericSuccess);
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    throw error;
  }
}
