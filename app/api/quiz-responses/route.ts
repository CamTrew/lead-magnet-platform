import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordQuizResponse } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/quiz-responses';

const schema = z.object({
  submissionId: z.string().uuid(),
  leadMagnetId: z.string().uuid(),
  questionId: z.string().trim().min(1).max(80),
  optionId: z.string().trim().min(1).max(80),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'That quiz answer is not valid.' }, { status: 400 });
    }

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 80,
        scope: 'quiz-response:ip',
        windowSeconds: 15 * 60,
      },
      {
        identifier: `${parsed.data.submissionId}:${parsed.data.questionId}`,
        limit: 12,
        scope: 'quiz-response:submission',
        windowSeconds: 60 * 60,
      },
    ]);

    const result = await recordQuizResponse(parsed.data);
    if (!result) {
      return NextResponse.json({ error: 'This quiz answer is no longer available.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.error('Quiz response failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      extra: { error },
    });
    return NextResponse.json({ error: 'Could not save that answer. Please try again.' }, { status: 500 });
  }
}
