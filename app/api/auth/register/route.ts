import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthActionError, createRegisterSession } from '@/lib/auth';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
});

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

    const { email, password, name } = parsed.data;
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

    const user = await createRegisterSession(email, password, name);

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
