import { NextResponse } from 'next/server';
import { enforceRateLimits, RateLimitError } from './rate-limit';
import {
  AI_REQUESTS_BY_ACTION_PER_DAY,
  AI_REQUESTS_PER_ACCOUNT_PER_DAY,
} from './limits';

export type AiAction = keyof typeof AI_REQUESTS_BY_ACTION_PER_DAY;

/**
 * Cost protection for authenticated AI features. The shared account counter
 * prevents a customer from bypassing the allowance by hopping between tools;
 * the action counter keeps the more expensive generators bounded as well.
 */
export async function enforceAiUsageLimit(accountId: string, action: AiAction) {
  await enforceRateLimits([
    {
      identifier: accountId,
      limit: AI_REQUESTS_PER_ACCOUNT_PER_DAY,
      scope: 'ai:account:daily',
      windowSeconds: 24 * 60 * 60,
    },
    {
      identifier: accountId,
      limit: AI_REQUESTS_BY_ACTION_PER_DAY[action],
      scope: `ai:${action}:account:daily`,
      windowSeconds: 24 * 60 * 60,
    },
  ]);
}

export function isAiUsageLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError && error.scope.startsWith('ai:');
}

export function aiUsageLimitResponse(error: RateLimitError) {
  return NextResponse.json(
    {
      code: 'AI_DAILY_LIMIT_REACHED',
      error: 'You have reached today\'s AI allowance. Your access resets automatically within 24 hours.',
    },
    {
      status: 429,
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    }
  );
}
