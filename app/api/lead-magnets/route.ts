import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { createLeadMagnet, LeadMagnetLimitError } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { isSetupComplete } from '@/lib/setup';

const ROUTE = '/api/lead-magnets';

const schema = z.object({
  title: z.string().trim().min(1, 'Page name is required').max(120),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, digits, and hyphens'),
  downloadLink: z
    .string()
    .trim()
    .min(1, 'Resource URL is required')
    .max(2048)
    .superRefine((value, ctx) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resource URL must start with http:// or https://' });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resource URL is not a valid URL' });
      }
    }),
}).strict();

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function POST(request: Request) {
  const start = Date.now();
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    if (!isSetupComplete(payload.account)) {
      return NextResponse.json(
        { error: 'Finish account setup before creating magnets.' },
        { status: 412 }
      );
    }

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 30,
        scope: 'lead-magnets:create:user',
        windowSeconds: 60 * 60,
      },
      {
        identifier: requestIp(request as Parameters<typeof requestIp>[0]),
        limit: 60,
        scope: 'lead-magnets:create:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the page fields and try again.';
      log.warn('Bad lead-magnet payload', { route: ROUTE, method: 'POST', status: 400, userId, accountId });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { title, slug, downloadLink } = parsed.data;
    const leadMagnet = await createLeadMagnet(payload.account.id, title, slug, downloadLink);

    log.info('Lead magnet created', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      durationMs: Date.now() - start,
      extra: { leadMagnetId: leadMagnet.id, slug: leadMagnet.slug },
    });

    return NextResponse.json({ leadMagnet });
  } catch (err) {
    if (err instanceof RateLimitError) {
      log.warn('Rate limited', { route: ROUTE, method: 'POST', status: 429, userId, accountId });
      return rateLimitResponse(err);
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'That page path is already in use.' }, { status: 409 });
    }
    if (err instanceof LeadMagnetLimitError) {
      log.warn('Lead magnet page limit reached', { route: ROUTE, method: 'POST', status: 403, userId, accountId });
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    log.error('Lead magnet create failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not create page' }, { status: 500 });
  }
}
