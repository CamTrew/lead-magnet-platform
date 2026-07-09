import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  isValidRootDomain,
  isValidSubdomain,
  normaliseRootDomain,
  normaliseSubdomain,
  parseSenderEmail,
} from '@/lib/dns-records';
import {
  clearDomainAttached,
  recordDomainAttached,
  updateAccount,
} from '@/lib/platform-store';
import { SecretConfigurationError } from '@/lib/secrets';
import {
  attachDomain,
  getDomainConfig,
  isVercelConfigured,
  removeDomain,
  VercelApiError,
} from '@/lib/vercel';
import {
  clearRateLimits,
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import {
  logoValidationMessage,
  MAX_LOGO_DATA_URL_LENGTH,
  validateLogoDataUrl,
} from '@/lib/upload';
import { log } from '@/lib/logger';
import {
  MAX_BRAND_HIGHLIGHT_INTENSITY,
  MIN_BRAND_HIGHLIGHT_INTENSITY,
} from '@/lib/brand-highlight';

const ROUTE = '/api/account';

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);
const brandHighlightIntensitySchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  },
  z
    .number({ invalid_type_error: 'Choose a highlight intensity.' })
    .min(MIN_BRAND_HIGHLIGHT_INTENSITY, 'Choose a highlight intensity.')
    .max(MAX_BRAND_HIGHLIGHT_INTENSITY, 'Choose a highlight intensity.')
    .transform((value) => Math.round(value))
);
const logoSchema = z
  .string()
  .max(MAX_LOGO_DATA_URL_LENGTH, 'Logo is too large')
  .superRefine((value, ctx) => {
    const result = validateLogoDataUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: logoValidationMessage(result.reason) });
    }
  });
const domainSchema = z
  .string()
  .trim()
  .max(253)
  .transform(normaliseRootDomain)
  .refine(
    (value) => value === '' || isValidRootDomain(value),
    'Enter a valid root domain'
  );

const schema = z.object({
  subdomain: z
    .string()
    .trim()
    .max(63)
    .transform(normaliseSubdomain)
    .refine(
      isValidSubdomain,
      'Enter a valid subdomain'
    ),
  domain: domainSchema,
  logoUrl: logoSchema,
  logoText: z.string().trim().max(80),
  brand: z.object({
    primary: hexColorSchema,
    accent: hexColorSchema,
    success: hexColorSchema,
    highlightIntensity: brandHighlightIntensitySchema,
  }),
  resendFromEmail: z
    .string()
    .trim()
    .max(320)
    .refine(
      (value) => value === '' || parseSenderEmail(value) !== null,
      'Enter a sender like Your Brand <hello@example.com>'
    ),
  resendApiKey: z.string().max(2000),
  // Subdomain label we tell Resend to namespace records under. Must be a
  // single DNS label (lowercase alphanumeric + hyphen, max 63 chars).
  resendReturnPath: z
    .string()
    .trim()
    .toLowerCase()
    .max(63)
    .refine(
      (value) => value === '' || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
      'Pick a single subdomain label (letters, digits, hyphens).'
    ),
  beehiivApiKey: z.string().max(2000),
  beehiivPublicationId: z.string().trim().max(200),
  substackPublication: z.string().trim().max(200),
  calendarWebhookEnabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (!value.logoUrl && !value.logoText.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add a business name or upload a logo.',
      path: ['logoText'],
    });
  }

  if (
    value.resendReturnPath &&
    value.subdomain &&
    value.resendReturnPath === value.subdomain
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Use a different sending subdomain than your page subdomain. Try send.',
      path: ['resendReturnPath'],
    });
  }
});

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function buildHost(subdomain: string, domain: string): string {
  // The product only ever serves on a subdomain (default "get") — we do not
  // attach the apex domain. Keeping the host singular keeps Vercel domain
  // bookkeeping precise.
  if (!domain || !subdomain) return '';
  return `${subdomain.toLowerCase()}.${domain.toLowerCase()}`;
}

function friendlyAttachError(error: unknown) {
  if (error instanceof VercelApiError) {
    if (error.status === 409 && (error.code === 'domain_already_in_use' || error.code === 'not_available')) {
      return 'Saved, but that subdomain is in use by another account. Pick a different subdomain or contact support.';
    }
    if (error.status === 403 || error.code === 'forbidden') {
      return 'Saved, but we could not connect that subdomain. Contact support if the issue persists.';
    }
    if (error.code === 'timeout') {
      return 'Saved, but Vercel took too long to connect that subdomain. Try Check again in a minute.';
    }
  }

  if (isUniqueViolation(error)) {
    return 'Saved, but that subdomain is already connected to another account.';
  }

  return 'Saved, but we could not connect that subdomain right now. Try again in a minute.';
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 60,
        scope: 'account:update:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 120,
        scope: 'account:update:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the configuration fields and try again.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const previousHost = buildHost(payload.account.subdomain, payload.account.domain);
    const previousAttachedHost = payload.account.domainAttachedHost;
    let account = await updateAccount(payload.account.id, parsed.data);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const currentHost = buildHost(account.subdomain, account.domain);

    // If anything that affects DNS / Vercel attach changed, blow away the
    // per-user cooldowns on the check endpoints. Forcing the user to wait
    // out a stale 1-minute cooldown after they fixed the underlying record
    // is just punishment for our cache.
    const dnsInputsChanged =
      payload.account.domain !== account.domain ||
      payload.account.subdomain !== account.subdomain ||
      payload.account.resendFromEmail !== account.resendFromEmail ||
      payload.account.resendReturnPath !== account.resendReturnPath ||
      // Resend key change means we'll be calling a different account on the
      // delivery check, so any prior failures are no longer relevant.
      (typeof parsed.data.resendApiKey === 'string' &&
        parsed.data.resendApiKey.length > 0 &&
        !parsed.data.resendApiKey.startsWith('*'));
    if (dnsInputsChanged) {
      try {
        await clearRateLimits(
          [
            'dns:verify:user',
            'domain:verify-ownership:user',
            'domain:attach:user',
          ],
          payload.user.id
        );
      } catch (clearErr) {
        // Best-effort: a stale cooldown isn't worth failing the save.
        log.warn('Failed to clear DNS cooldowns after settings change', {
          route: ROUTE,
          method: 'PUT',
          userId: payload.user.id,
          accountId: payload.account.id,
          extra: { error: clearErr },
        });
      }
    }

    // If the publishing host changed AND we previously attached one, detach the
    // old host. Once ownership is already verified, we immediately try to attach
    // the new host so the user does not need a separate "connect" step.
    let detached = false;
    let detachError: string | null = null;
    let attached = false;
    let attachError: string | null = null;
    const shouldDetach =
      previousAttachedHost &&
      previousAttachedHost !== currentHost;
    if (shouldDetach) {
      try {
        detached = await removeDomain(previousAttachedHost);
        await clearDomainAttached(payload.account.id);
        account = {
          ...account,
          domainAttachedHost: '',
          domainRecommendedCname: '',
        };
      } catch (detachErr) {
        detachError = (detachErr as Error).message;
        log.error('Detach failed during account save', {
          route: ROUTE,
          method: 'PUT',
          userId: payload.user.id,
          accountId: payload.account.id,
          extra: { error: detachErr },
        });
      }
    }

    const shouldAttach =
      currentHost &&
      Boolean(account.domainVerifiedAt) &&
      account.domainAttachedHost !== currentHost;

    if (shouldAttach) {
      if (!isVercelConfigured()) {
        attachError = 'Saved, but the publishing host is not configured on the server.';
      } else {
        try {
          await attachDomain(currentHost);

          let recommendedCname = '';
          try {
            const config = await getDomainConfig(currentHost);
            recommendedCname = config?.recommendedCname || '';
          } catch (configErr) {
            log.warn('Could not fetch domain config during account save', {
              route: ROUTE,
              method: 'PUT',
              userId: payload.user.id,
              accountId: payload.account.id,
              extra: { host: currentHost, error: configErr },
            });
          }

          const updated = await recordDomainAttached(payload.account.id, currentHost, recommendedCname);
          if (updated) {
            account = {
              ...account,
              domainAttachedHost: updated.domainAttachedHost,
              domainRecommendedCname: updated.domainRecommendedCname,
              updatedAt: updated.updatedAt,
            };
            attached = true;
          }
        } catch (attachErr) {
          attachError = friendlyAttachError(attachErr);
          log.warn('Auto attach failed during account save', {
            route: ROUTE,
            method: 'PUT',
            userId: payload.user.id,
            accountId: payload.account.id,
            extra: {
              host: currentHost,
              error: attachErr,
            },
          });
        }
      }
    }

    log.info('Account updated', {
      route: ROUTE,
      method: 'PUT',
      status: 200,
      userId: payload.user.id,
      accountId: payload.account.id,
      extra: {
        subdomainChanged: payload.account.subdomain !== account.subdomain,
        domainChanged: payload.account.domain !== account.domain,
        previousHost,
        currentHost,
        detached,
        attached,
      },
    });

    return NextResponse.json({ account, detached, detachError, attached, attachError });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    if (err instanceof SecretConfigurationError) {
      return NextResponse.json(
        { error: 'Secure account storage is not configured. Contact support before saving settings.' },
        { status: 500 }
      );
    }

    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'That domain and subdomain are already in use.' }, { status: 409 });
    }

    log.error('Account update failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 });
  }
}
