import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthActionError,
  createEmailVerificationForUser,
  createRegistration,
} from '@/lib/auth';
import { log } from '@/lib/logger';
import { sendEmailVerificationEmail } from '@/lib/resend';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { subscribeToPlatformNewsletter } from '@/lib/platform-newsletter';
import { SecretConfigurationError } from '@/lib/secrets';

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
  name: z.string().trim().min(1).max(120),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service to continue.' }),
  }),
  newsletterOptIn: z.boolean().optional().default(false),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Use a valid email, your name, and a password of at least 8 characters.' },
        { status: 400 }
      );
    }

    const { email, password, name, newsletterOptIn } = parsed.data;
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 12,
        scope: 'auth:register:ip',
        windowSeconds: 60 * 60,
      },
      {
        identifier: email,
        limit: 3,
        scope: 'auth:register:email',
        windowSeconds: 60 * 60,
      },
    ]);

    const user = await createRegistration(email, password, name);
    const verification = await createEmailVerificationForUser(user.id, user.email);

    try {
      await sendEmailVerificationEmail({
        to: verification.email,
        code: verification.code,
      });
    } catch (error) {
      // The account and verification token are still valid. Sending the user
      // to the pending screen gives them a safe resend path instead of making
      // a successfully-created account look like registration failed.
      log.error('Registration verification email could not be sent', {
        route: '/api/auth/register',
        method: 'POST',
        status: 201,
        userId: user.id,
        extra: { error },
      });
    }

    // Newsletter consent is optional and never blocks account creation.
    if (newsletterOptIn) {
      void subscribeToPlatformNewsletter({ email, name });
    }

    return NextResponse.json(
      { user, verificationRequired: true },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthActionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }

    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    log.error('Registration failed', {
      route: '/api/auth/register', method: 'POST', status: err instanceof SecretConfigurationError ? 503 : 500,
      extra: { error: err },
    });
    return NextResponse.json(
      { error: 'We couldn’t finish setting up your account. Please try again shortly using the same email and password.' },
      { status: err instanceof SecretConfigurationError ? 503 : 500 }
    );
  }
}
