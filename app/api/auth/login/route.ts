import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthActionError, createLoginSession } from '@/lib/auth';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
    }

    const { email, password } = parsed.data;
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'auth:login:ip',
        windowSeconds: 15 * 60,
      },
      {
        identifier: email,
        limit: 8,
        scope: 'auth:login:email',
        windowSeconds: 15 * 60,
      },
    ]);

    const user = await createLoginSession(email, password);

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    throw err;
  }
}
