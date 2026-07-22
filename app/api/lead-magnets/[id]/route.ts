import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  deleteLeadMagnet,
  findLeadMagnetForAccount,
  getAccountWithSecrets,
  LeadMagnetMutationInProgressError,
  updateLeadMagnet,
  updateLeadMagnetFollowUpSync,
  withLeadMagnetMutationLock,
} from '@/lib/platform-store';
import {
  FollowUpSequenceError,
  followUpAutomationNeedsSync,
  syncLeadMagnetFollowUpAutomation,
} from '@/lib/follow-up-sequences';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { proxyEmailImagesInBody } from '@/lib/email-image-proxy';
import { invalidatePublishedLeadMagnetCache } from '@/lib/public-lead-magnet-cache';
import { validateQuizConfiguration } from '@/lib/lead-magnet-validation';
import { pruneQuizRouteConditions } from '@/lib/quiz-routing';
import {
  type LogoValidationError,
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

function isEmailImageProxyUrl(value: string) {
  return /^\/email-images\/[0-9a-f-]{36}(\?.*)?$/i.test(value)
    || /^\/local-email-images\/[0-9a-f-]{36}(\?.*)?$/i.test(value);
}

function isRemoteImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return !url.pathname.toLowerCase().endsWith('.svg');
  } catch {
    return false;
  }
}

function imageValidationMessage(reason: LogoValidationError) {
  if (reason === 'empty') return 'The image file is empty.';
  if (reason === 'too_large') return 'Image must be 10 MB or smaller.';
  if (reason === 'bad_format') return 'Re-upload the image. We could not read the file you provided.';
  if (reason === 'mime_not_allowed') return 'Image must be a PNG, JPG, WebP, or GIF. SVG is not supported.';
  return 'That file does not look like the image type it claims to be.';
}

const imageSchema = z
  .string()
  .max(MAX_MAGNET_IMAGE_DATA_URL_LENGTH, 'Image is too large')
  .superRefine((value, ctx) => {
    if (
      !value ||
      isVercelBlobImageUrl(value) ||
      isLeadMagnetImageProxyUrl(value) ||
      isEmailImageProxyUrl(value) ||
      isRemoteImageUrl(value)
    ) {
      return;
    }

    const result = validateLogoDataUrl(value, {
      maxBytes: MAX_MAGNET_IMAGE_BYTES,
      maxLength: MAX_MAGNET_IMAGE_DATA_URL_LENGTH,
    });
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: imageValidationMessage(result.reason),
      });
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

const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, ctx) => {
    if (!value) return;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a full http:// or https:// URL.' });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid URL.' });
    }
  });

const quizOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  destinationUrl: httpUrlSchema,
}).strict();

const quizQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(240),
  options: z.array(quizOptionSchema).min(2).max(6),
}).strict();

const quizRouteConditionSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  optionId: z.string().trim().min(1).max(80),
}).strict();

const quizRouteSchema = z.object({
  id: z.string().trim().min(1).max(80),
  destinationUrl: httpUrlSchema,
  conditions: z.array(quizRouteConditionSchema).max(5),
}).strict();

const abVariantSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(60),
  title: z.string().trim().max(160),
  subtitle: z.string().trim().max(240),
  imageUrl: imageSchema,
}).strict();

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
  // Provider resources are replaced only when the editor explicitly reports
  // a follow-up edit. Full-form autosaves from older tabs otherwise make
  // unrelated Delivery changes look like sequence mutations.
  syncFollowUp: z.boolean().optional().default(false),
  saveSource: z.enum(['autosave', 'manual', 'restore']).optional().default('manual'),
  // Accepted for compatibility with already-open editor tabs, but ignored.
  // Provider resource IDs are server-owned and must never be restored from a
  // stale browser payload.
  resendFollowUpAutomationId: z.string().max(200).optional(),
  postSignupMode: z.enum(['message', 'redirect', 'page']),
  postSignupRedirectUrl: httpUrlSchema,
  postSignupHeading: z.string().max(160),
  postSignupBody: z.string().max(5000),
  postSignupVideoUrl: httpUrlSchema,
  postSignupCtaLabel: z.string().max(80),
  postSignupCtaUrl: httpUrlSchema,
  postSignupQuizEnabled: z.boolean(),
  postSignupQuizTitle: z.string().max(140),
  postSignupQuizDescription: z.string().max(300),
  postSignupQuizQuestions: z.array(quizQuestionSchema).max(5),
  postSignupQuizRoutes: z.array(quizRouteSchema).max(20),
  // Optional so an already-open pre-A/B editor tab cannot silently turn off
  // a running experiment when it autosaves unrelated email changes.
  abTestEnabled: z.boolean().optional(),
  abTestVariants: z.array(abVariantSchema).max(3).optional(),
  // Runtime markers let the server detect an editor tab that was opened
  // before an automatic winner was applied.
  abTestCompletedAt: z.string().max(80).optional(),
  abTestWinnerId: z.string().max(40).optional(),
  published: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const variantIds = new Set<string>();
  const abVariants = value.abTestVariants || [];
  abVariants.forEach((variant, index) => {
    if (variant.id === 'control' || variantIds.has(variant.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each A/B variant needs a unique name.', path: ['abTestVariants', index, 'name'] });
    }
    variantIds.add(variant.id);
    if (!variant.title && !variant.subtitle && !variant.imageUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Change at least one headline, subheadline, or image.', path: ['abTestVariants', index] });
    }
  });
  if (value.abTestEnabled && abVariants.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add a variant before enabling the A/B test.', path: ['abTestVariants'] });
  }
  const followUpIds = new Set<string>();
  value.followUpEmails.forEach((email, index) => {
    if (followUpIds.has(email.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Follow-up email ${index + 1} has a duplicate internal ID. Remove it and add it again.`,
        path: ['followUpEmails', index, 'id'],
      });
    }
    followUpIds.add(email.id);
  });

  if (value.postSignupMode === 'page' && value.postSignupQuizEnabled) {
    validateQuizConfiguration({
      published: value.published,
      questions: value.postSignupQuizQuestions,
      routes: value.postSignupQuizRoutes,
    }).forEach((issue) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    });
  }

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

  if (value.postSignupMode === 'redirect' && !value.postSignupRedirectUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add a destination URL for the post-signup redirect.',
      path: ['postSignupRedirectUrl'],
    });
  }

  if (
    value.postSignupMode === 'page'
    && value.postSignupQuizEnabled
    && value.postSignupQuizQuestions.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one quiz question before publishing.',
      path: ['postSignupQuizQuestions'],
    });
  }

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
    message.startsWith('Magnets could not create this follow-up sequence yet')
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

    return await withLeadMagnetMutationLock(payload.account.id, id, async () => {
      const previousLeadMagnet = await findLeadMagnetForAccount(payload.account.id, id);
      const previousTemplates = new Map(
        previousLeadMagnet?.followUpEmails.map((email) => [email.id, email.resendTemplateId]) || []
      );
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      const {
        saveSource,
        syncFollowUp,
        abTestCompletedAt: clientAbTestCompletedAt,
        abTestWinnerId: clientAbTestWinnerId,
        ...persistedData
      } = parsed.data;
      const abTestStateIsCurrent = (
        (clientAbTestCompletedAt || '') === (previousLeadMagnet?.abTestCompletedAt || '')
        && (clientAbTestWinnerId || '') === (previousLeadMagnet?.abTestWinnerId || '')
      );
      const safePersistedData = !abTestStateIsCurrent && previousLeadMagnet
        ? {
            ...persistedData,
            title: previousLeadMagnet.title,
            subtitle: previousLeadMagnet.subtitle,
            imageUrl: previousLeadMagnet.imageUrl,
          }
        : persistedData;
      const updateData = {
        ...safePersistedData,
        // These IDs identify live provider resources. Keeping the database
        // values prevents a stale editor tab from orphaning an enabled
        // Automation or restoring an obsolete template ID.
        resendFollowUpAutomationId: previousLeadMagnet?.resendFollowUpAutomationId || '',
        followUpStopOnBooking: parsed.data.followUpEnabled
          && parsed.data.followUpStopOnBooking,
        postSignupQuizEnabled: parsed.data.postSignupMode === 'page'
          && parsed.data.postSignupQuizEnabled,
        postSignupQuizRoutes: pruneQuizRouteConditions(
          parsed.data.postSignupQuizQuestions,
          parsed.data.postSignupQuizRoutes
        ),
        abTestEnabled: (
          abTestStateIsCurrent
            ? (parsed.data.abTestEnabled ?? previousLeadMagnet?.abTestEnabled ?? false)
            : (previousLeadMagnet?.abTestEnabled ?? false)
        ) && (
          abTestStateIsCurrent
            ? (parsed.data.abTestVariants ?? previousLeadMagnet?.abTestVariants ?? [])
            : (previousLeadMagnet?.abTestVariants ?? [])
        ).length > 0,
        abTestVariants: abTestStateIsCurrent
          ? (parsed.data.abTestVariants ?? previousLeadMagnet?.abTestVariants ?? [])
          : (previousLeadMagnet?.abTestVariants ?? []),
        emailBody: proxyEmailImagesInBody({
          accountId: payload.account.id,
          baseUrl,
          body: parsed.data.emailBody,
          leadMagnetId: id,
        }),
        followUpEmails: parsed.data.followUpEmails.map((email) => ({
          ...email,
          resendTemplateId: previousTemplates.get(email.id) || '',
          body: proxyEmailImagesInBody({
            accountId: payload.account.id,
            baseUrl,
            body: email.body,
            leadMagnetId: id,
          }),
        })),
      };

      let leadMagnet = await updateLeadMagnet(payload.account.id, id, updateData, {
        versionSource: saveSource,
      });

      if (!leadMagnet) {
        return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
      }
      invalidatePublishedLeadMagnetCache();

      try {
        if (!syncFollowUp || !followUpAutomationNeedsSync(previousLeadMagnet, leadMagnet)) {
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
          resendFollowUpRenderVersion: followUp.renderVersion,
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
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    if (err instanceof LeadMagnetMutationInProgressError) {
      return NextResponse.json(
        { error: 'This page is already being saved. Wait a moment and try again.' },
        { status: 409 }
      );
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
    invalidatePublishedLeadMagnetCache();

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
