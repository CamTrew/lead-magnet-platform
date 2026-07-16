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
import { isValidPlatformUsername, normalisePlatformUsername } from '@/lib/platform-username';
import {
  AccountDomainMutationInProgressError,
  clearDomainAttached,
  getAccountWithSecrets,
  recordDomainAttached,
  updateAccount,
  withAccountDomainMutationLock,
} from '@/lib/platform-store';
import { isMaskedSecret, SecretConfigurationError } from '@/lib/secrets';
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
import { isValidSlackWebhookUrl } from '@/lib/slack';
import { invalidatePublishedLeadMagnetCache } from '@/lib/public-lead-magnet-cache';

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
    if (!value || value.startsWith('https://') || value.startsWith('/brand-logos/')) return;
    const result = validateLogoDataUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: logoValidationMessage(result.reason) });
    }
  });

const optionalLegalUrlSchema = z
  .string()
  .trim()
  .max(2048, 'URL is too long.')
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Enter a full URL beginning with https://');

function isAccountLogoUrl(value: string, accountId: string) {
  if (!value || value.startsWith('data:')) return true;
  if (value === `/brand-logos/${accountId}` || value.startsWith(`/brand-logos/${accountId}?`)) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.blob.vercel-storage.com') &&
      url.pathname.startsWith(`/brand-logos/${accountId}/`)
    );
  } catch {
    return false;
  }
}
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
  username: z
    .string()
    .trim()
    .max(40)
    .default('')
    .transform(normalisePlatformUsername)
    .refine(
      (value) => value === '' || isValidPlatformUsername(value),
      'Use 3 to 40 lowercase letters, numbers, or hyphens for your Magnets URL.'
    ),
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
    // Older dashboard tabs can submit the previous brand shape while a new
    // deployment is rolling out. Treat the missing appearance choice as light.
    pageTheme: z.enum(['light', 'dark']).default('light'),
    // Optional during rolling deploys so an older open dashboard tab cannot
    // erase legal links that were saved by the newer UI.
    privacyPolicyUrl: optionalLegalUrlSchema.optional(),
    termsUrl: optionalLegalUrlSchema.optional(),
  }).strict(),
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
  slackWebhookUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (value) => value === '' || isMaskedSecret(value) || isValidSlackWebhookUrl(value),
      'Paste a valid Slack incoming-webhook URL.'
    ),
  pipedriveApiToken: z.string().trim().max(2000),
  calendarWebhookEnabled: z.boolean(),
}).strict();

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isUsernameUniqueViolation(error: unknown) {
  return (
    isUniqueViolation(error) &&
    typeof error === 'object' &&
    error !== null &&
    'constraint' in error &&
    error.constraint === 'magnets_accounts_username_unique'
  );
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

    if (!isAccountLogoUrl(parsed.data.logoUrl, payload.account.id)) {
      return NextResponse.json({ error: 'That logo upload is not valid for this account.' }, { status: 400 });
    }

    const requestedHost = buildHost(parsed.data.subdomain, parsed.data.domain);
    const publishingHostChanged =
      payload.account.domain !== parsed.data.domain ||
      payload.account.subdomain !== parsed.data.subdomain;
    if (publishingHostChanged) {
      await enforceRateLimits([
        {
          identifier: payload.user.id,
          limit: 10,
          scope: 'account:domain-change:user',
          windowSeconds: 60 * 60,
        },
        {
          identifier: requestIp(request),
          limit: 30,
          scope: 'account:domain-change:ip',
          windowSeconds: 60 * 60,
        },
      ]);
    }

    return await withAccountDomainMutationLock(payload.account.id, async () => {
      // Reload after acquiring the lock. A second browser tab may have completed
      // a domain change since requireDashboardPayload built its response.
      const storedAccount = await getAccountWithSecrets(payload.account.id);
      if (!storedAccount) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const previousHost = buildHost(storedAccount.subdomain, storedAccount.domain);
      const previousAttachedHost = storedAccount.domainAttachedHost;
      const shouldDetach = Boolean(
        previousAttachedHost && previousAttachedHost !== requestedHost
      );

      // Cleanup is mandatory. Never discard the database reference to a Vercel
      // hostname until Vercel confirms it is gone (or that it was already absent).
      let detached = false;
      if (shouldDetach) {
        if (!isVercelConfigured()) {
          return NextResponse.json(
            { error: 'We could not remove the previous publishing domain. Try again or contact support.' },
            { status: 503 }
          );
        }

        try {
          detached = await removeDomain(previousAttachedHost);
          await clearDomainAttached(payload.account.id);
        } catch (detachErr) {
          log.error('Detach blocked account domain change', {
            route: ROUTE,
            method: 'PUT',
            status: 502,
            userId: payload.user.id,
            accountId: payload.account.id,
            extra: { host: previousAttachedHost, error: detachErr },
          });
          return NextResponse.json(
            { error: 'We could not remove the previous publishing domain. Nothing was changed. Try again.' },
            { status: 502 }
          );
        }
      }

      let account = await updateAccount(payload.account.id, {
        ...parsed.data,
        brand: {
          ...storedAccount.brand,
          ...parsed.data.brand,
        },
      });

      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      invalidatePublishedLeadMagnetCache();

      const currentHost = buildHost(account.subdomain, account.domain);

      // If anything that affects DNS / Vercel attach changed, blow away the
      // per-user cooldowns on the check endpoints. Forcing the user to wait
      // out a stale 1-minute cooldown after they fixed the underlying record
      // is just punishment for our cache.
      const dnsInputsChanged =
        storedAccount.domain !== account.domain ||
        storedAccount.subdomain !== account.subdomain ||
        storedAccount.resendFromEmail !== account.resendFromEmail ||
        storedAccount.resendReturnPath !== account.resendReturnPath ||
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

      let attached = false;
      let attachError: string | null = null;

      const shouldAttach =
        currentHost &&
        Boolean(account.domainVerifiedAt) &&
        account.domainAttachedHost !== currentHost;

      if (shouldAttach) {
        if (!isVercelConfigured()) {
          attachError = 'Saved, but the publishing host is not configured on the server.';
        } else {
          // Reserve the hostname in Postgres before touching Vercel. The unique
          // index prevents another account from attaching the same hostname and
          // leaves us a cleanup reference if Vercel returns an uncertain result.
          const reserved = await recordDomainAttached(payload.account.id, currentHost, '');
          if (reserved) account = reserved;

          let attachFailed: unknown = null;
          try {
            await attachDomain(currentHost);
          } catch (attachErr) {
            attachFailed = attachErr;
          }

          if (attachFailed) {
            attachError = friendlyAttachError(attachFailed);
            let cleanupConfirmed = false;
            try {
              await removeDomain(currentHost);
              cleanupConfirmed = true;
            } catch (cleanupErr) {
              log.error('Failed to compensate uncertain domain attachment', {
                route: ROUTE,
                method: 'PUT',
                userId: payload.user.id,
                accountId: payload.account.id,
                extra: { host: currentHost, error: cleanupErr },
              });
            }

            if (cleanupConfirmed) {
              await clearDomainAttached(payload.account.id);
              account = {
                ...account,
                domainAttachedHost: '',
                domainRecommendedCname: '',
              };
            }

            log.warn('Auto attach failed during account save', {
              route: ROUTE,
              method: 'PUT',
              userId: payload.user.id,
              accountId: payload.account.id,
              extra: { host: currentHost, cleanupConfirmed, error: attachFailed },
            });
          } else {
            try {
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
              // The hostname is attached and reserved. A failure to save only
              // its recommended CNAME must not clear the ownership reference.
              attachError = 'Saved and connected, but the DNS recommendation is still loading.';
              log.warn('Could not finish attached domain metadata', {
                route: ROUTE,
                method: 'PUT',
                userId: payload.user.id,
                accountId: payload.account.id,
                extra: { host: currentHost, error: attachErr },
              });
            }
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
          subdomainChanged: storedAccount.subdomain !== account.subdomain,
          domainChanged: storedAccount.domain !== account.domain,
          previousHost,
          currentHost,
          detached,
          attached,
        },
      });

      return NextResponse.json({ account, detached, detachError: null, attached, attachError });
    });
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

    if (err instanceof AccountDomainMutationInProgressError) {
      return NextResponse.json(
        { error: 'Another domain change is already in progress. Wait a moment and try again.' },
        { status: 409 }
      );
    }

    if (isUsernameUniqueViolation(err)) {
      return NextResponse.json({ error: 'That Magnets URL is already taken.' }, { status: 409 });
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
