import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { deleteLeadMagnet, updateLeadMagnet } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  logoValidationMessage,
  MAX_LOGO_DATA_URL_LENGTH,
  validateLogoDataUrl,
} from '@/lib/upload';

const ROUTE = '/api/lead-magnets/[id]';

const idSchema = z.string().uuid();

const imageSchema = z
  .string()
  .max(MAX_LOGO_DATA_URL_LENGTH, 'Image is too large')
  .superRefine((value, ctx) => {
    const result = validateLogoDataUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: logoValidationMessage(result.reason) });
    }
  });

const downloadLinkSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, ctx) => {
    if (!value) return;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resource URL must start with http:// or https://' });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resource URL is not a valid URL' });
    }
  });

const schema = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().max(240),
  description: z.string().max(5000),
  bullets: z.array(z.string().trim().min(1).max(220)).max(20),
  bulletsHeading: z.string().max(140),
  ctaText: z.string().trim().min(1).max(80),
  formHeading: z.string().max(140),
  formSubtext: z.string().max(240),
  imageUrl: imageSchema,
  downloadLink: downloadLinkSchema,
  emailSubject: z.string().max(180),
  emailBody: z.string().max(10000),
  emailPreview: z.string().max(240),
  published: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.published && !value.downloadLink.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add a Resource URL before publishing — the email needs a link to send.',
      path: ['downloadLink'],
    });
  }
});

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 240,
        scope: 'lead-magnets:update:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 480,
        scope: 'lead-magnets:update:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const { id: rawId } = await params;
    const idParse = idSchema.safeParse(rawId);
    if (!idParse.success) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }
    const id = idParse.data;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the page fields and try again.';
      log.warn('Bad lead-magnet update', {
        route: ROUTE,
        method: 'PUT',
        status: 400,
        userId,
        accountId,
        extra: { issue: parsed.error.issues[0]?.path?.join('.') },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const leadMagnet = await updateLeadMagnet(payload.account.id, id, parsed.data);

    if (!leadMagnet) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    log.info('Lead magnet updated', {
      route: ROUTE,
      method: 'PUT',
      status: 200,
      userId,
      accountId,
      durationMs: Date.now() - start,
      extra: { leadMagnetId: id, published: leadMagnet.published },
    });

    return NextResponse.json({ leadMagnet });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'That page path is already in use.' }, { status: 409 });
    }
    log.error('Lead magnet update failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not save page' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 30,
        scope: 'lead-magnets:delete:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'lead-magnets:delete:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const { id: rawId } = await params;
    const idParse = idSchema.safeParse(rawId);
    if (!idParse.success) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }
    const id = idParse.data;

    const deleted = await deleteLeadMagnet(payload.account.id, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    log.info('Lead magnet deleted', {
      route: ROUTE,
      method: 'DELETE',
      status: 200,
      userId,
      accountId,
      extra: { leadMagnetId: id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Lead magnet delete failed', {
      route: ROUTE,
      method: 'DELETE',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not delete page' }, { status: 500 });
  }
}
