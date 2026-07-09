import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  deleteLeadMagnet,
  getAccountWithSecrets,
  updateLeadMagnet,
  updateLeadMagnetFollowUpSync,
} from '@/lib/platform-store';
import {
  FollowUpSequenceError,
  syncLeadMagnetFollowUpAutomation,
} from '@/lib/follow-up-sequences';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  logoValidationMessage,
  MAX_MAGNET_IMAGE_BYTES,
  MAX_MAGNET_IMAGE_DATA_URL_LENGTH,
  validateLogoDataUrl,
} from '@/lib/upload';

const ROUTE = '/api/lead-magnets/[id]';

const idSchema = z.string().uuid();

function isVercelBlobImageUrl(value: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function isLeadMagnetImageProxyUrl(value: string) {
  return /^\/magnet-images\/[0-9a-f-]{36}(\?.*)?$/i.test(value);
}

const imageSchema = z
  .string()
  .max(MAX_MAGNET_IMAGE_DATA_URL_LENGTH, 'Image is too large')
  .superRefine((value, ctx) => {
    if (!value || isVercelBlobImageUrl(value) || isLeadMagnetImageProxyUrl(value)) return;

    const result = validateLogoDataUrl(value, {
      maxBytes: MAX_MAGNET_IMAGE_BYTES,
      maxLength: MAX_MAGNET_IMAGE_DATA_URL_LENGTH,
    });
    if (!result.ok) {
      const message = result.reason === 'too_large'
        ? 'Image must be 10 MB or smaller.'
        : logoValidationMessage(result.reason).replace(/^The logo|^Logo/, 'Image');
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
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

const delayHoursSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  },
  z
    .number({ invalid_type_error: 'Enter a valid delay in hours.' })
    .min(0, 'Delay must be 0 hours or more.')
    .max(720, 'Delay must be 720 hours or less.')
    .transform((value) => Math.round(value))
);

const delayMinutesSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  },
  z
    .number({ invalid_type_error: 'Enter a valid delay.' })
    .min(0, 'Delay must be 0 minutes or more.')
    .max(30 * 24 * 60, 'Delay must be 30 days or less.')
    .transform((value) => Math.round(value))
);

const followUpEmailSchema = z.object({
  id: z.string().trim().min(1).max(80),
  delayHours: delayHoursSchema.optional(),
  delayMinutes: delayMinutesSchema.optional(),
  subject: z.string().trim().max(180),
  preview: z.string().max(240),
  body: z.string().max(10000),
  resendTemplateId: z.string().max(200),
}).strict().transform((email) => {
  const delayMinutes = email.delayMinutes ?? Math.round((email.delayHours ?? 24) * 60);
  return {
    ...email,
    delayMinutes,
    delayHours: Math.round(delayMinutes / 60),
  };
});

const schema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Page path is required.')
    .max(80, 'Page path must be 80 characters or less.')
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[a-z0-9-]+$/.test(value),
      'Page path can only contain letters, numbers, and hyphens.'
    ),
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
  followUpEnabled: z.boolean(),
  followUpStopOnBooking: z.boolean(),
  followUpEmails: z.array(followUpEmailSchema).max(10),
  resendFollowUpAutomationId: z.string().max(200),
  published: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.followUpEnabled) {
    const activeEmails = value.followUpEmails.filter(
      (email) => email.subject.trim() || email.body.trim()
    );

    if (activeEmails.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one follow-up email before enabling the sequence.',
        path: ['followUpEmails'],
      });
    }

    activeEmails.forEach((email, index) => {
      if (!email.subject.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Follow-up email ${index + 1} needs a subject.`,
          path: ['followUpEmails', index, 'subject'],
        });
      }
      if (!email.body.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Follow-up email ${index + 1} needs body text.`,
          path: ['followUpEmails', index, 'body'],
        });
      }
    });
  }

  if (!value.published) return;

  // When publishing, every visible field on the page and email must be filled.
  // Empty drafts can sit in the DB unpublished, but the moment the user toggles
  // to "Published" we refuse silently-empty content.
  const requirements: Array<{ key: keyof typeof value; label: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'description', label: 'Description' },
    { key: 'bulletsHeading', label: 'Bullets heading' },
    { key: 'ctaText', label: 'CTA button text' },
    { key: 'formHeading', label: 'Form heading' },
    { key: 'formSubtext', label: 'Form subtext' },
    { key: 'downloadLink', label: 'Resource URL' },
    { key: 'emailSubject', label: 'Email subject' },
    { key: 'emailBody', label: 'Email body' },
    { key: 'emailPreview', label: 'Email preview text' },
  ];

  for (const { key, label } of requirements) {
    const fieldValue = value[key];
    if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} is required before publishing.`,
        path: [key],
      });
    }
  }

  if (!Array.isArray(value.bullets) || value.bullets.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one bullet before publishing.',
      path: ['bullets'],
    });
  }

});

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function friendlyFollowUpSyncMessage(error: FollowUpSequenceError) {
  const message = error.message || '';
  if (
    message === 'Connect Resend before enabling a follow-up sequence.' ||
    message === 'Set your sender address before enabling a follow-up sequence.' ||
    message === 'Finish sender domain verification before enabling a follow-up sequence.' ||
    message === 'Add at least one follow-up email before enabling the sequence.' ||
    message.startsWith('Your Resend API key needs Full access')
  ) {
    return message;
  }

  return message
    ? `Resend could not save this follow-up sequence: ${message}`
    : 'Resend could not save this follow-up sequence. Check your Resend connection and try again.';
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

    let leadMagnet = await updateLeadMagnet(payload.account.id, id, parsed.data);

    if (!leadMagnet) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    try {
      if (!leadMagnet.followUpEnabled && !leadMagnet.resendFollowUpAutomationId) {
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
      }

      const accountWithSecrets = await getAccountWithSecrets(payload.account.id);
      if (!accountWithSecrets) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const followUp = await syncLeadMagnetFollowUpAutomation(accountWithSecrets, leadMagnet);
      const syncedLeadMagnet = await updateLeadMagnetFollowUpSync(payload.account.id, id, {
        followUpEmails: followUp.emails,
        resendFollowUpAutomationId: followUp.automationId,
      });
      if (syncedLeadMagnet) {
        leadMagnet = syncedLeadMagnet;
      }
    } catch (syncError) {
      if (syncError instanceof FollowUpSequenceError) {
        log.warn('Follow-up automation sync failed', {
          route: ROUTE,
          method: 'PUT',
          status: 502,
          userId,
          accountId,
          extra: { leadMagnetId: id, error: syncError },
        });
        return NextResponse.json({ error: friendlyFollowUpSyncMessage(syncError) }, { status: 502 });
      }
      throw syncError;
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
