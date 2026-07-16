import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { query } from './db';

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many requests');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

function hashIdentifier(identifier: string) {
  return createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
}

export function requestIp(request: Request) {
  const vercelForwardedFor = request.headers
    .get('x-vercel-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return vercelForwardedFor || forwardedFor || realIp || 'unknown';
}

type RateLimitInput = {
  identifier: string;
  limit: number;
  scope: string;
  windowSeconds: number;
};

export async function enforceRateLimit(input: RateLimitInput) {
  await enforceRateLimits([input]);
}

export async function enforceRateLimits(inputs: RateLimitInput[]) {
  if (inputs.length === 0) return;

  const records = inputs.map(({ identifier, limit, scope, windowSeconds }) => ({
    identifier_hash: hashIdentifier(identifier || 'unknown'),
    limit_value: limit,
    scope,
    window_seconds: windowSeconds,
  }));

  const result = await query<{ attempts: number; retry_after_seconds: string }>(
    `
      with input as (
        select
          scope,
          identifier_hash,
          limit_value,
          window_seconds
        from jsonb_to_recordset($1::jsonb) as limits(
          scope text,
          identifier_hash text,
          limit_value int,
          window_seconds int
        )
      ),
      upserted as (
        insert into public.magnets_rate_limits (
          scope,
          identifier_hash,
          window_start,
          attempts
        )
        select
          scope,
          identifier_hash,
          now(),
          1
        from input
        on conflict (scope, identifier_hash) do update
          set
            window_start = case
              when public.magnets_rate_limits.window_start < now() - (
                (
                  select input.window_seconds
                  from input
                  where input.scope = excluded.scope
                    and input.identifier_hash = excluded.identifier_hash
                  limit 1
                )::int * interval '1 second'
              )
                then now()
              else public.magnets_rate_limits.window_start
            end,
            attempts = case
              when public.magnets_rate_limits.window_start < now() - (
                (
                  select input.window_seconds
                  from input
                  where input.scope = excluded.scope
                    and input.identifier_hash = excluded.identifier_hash
                  limit 1
                )::int * interval '1 second'
              )
                then 1
              else public.magnets_rate_limits.attempts + 1
            end,
            updated_at = now()
        returning
          public.magnets_rate_limits.scope,
          public.magnets_rate_limits.identifier_hash,
          public.magnets_rate_limits.window_start,
          public.magnets_rate_limits.attempts
      )
      select
        upserted.attempts,
        greatest(
          1,
          extract(epoch from (
            upserted.window_start + (input.window_seconds::int * interval '1 second') - now()
          ))
        )::text as retry_after_seconds
      from upserted
      join input
        on input.scope = upserted.scope
       and input.identifier_hash = upserted.identifier_hash
      where upserted.attempts > input.limit_value
      order by retry_after_seconds desc
      limit 1
    `,
    [JSON.stringify(records)]
  );

  const row = result.rows[0];
  if (row) {
    throw new RateLimitError(Number(row.retry_after_seconds));
  }
}

/**
 * Wipe one or more rate-limit counters for a given identifier. Used when an
 * upstream change makes a prior cooldown irrelevant — e.g. the user just
 * edited their domain, so making them wait out the previous DNS check
 * cooldown would be punishing them for our mistake.
 */
export async function clearRateLimits(scopes: string[], identifier: string) {
  if (scopes.length === 0) return;
  await query(
    `
      delete from public.magnets_rate_limits
      where scope = any($1::text[])
        and identifier_hash = $2
    `,
    [scopes, hashIdentifier(identifier || 'unknown')]
  );
}

export function rateLimitResponse(error: RateLimitError) {
  return NextResponse.json(
    { error: 'Too many requests. Try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(error.retryAfterSeconds),
      },
    }
  );
}
