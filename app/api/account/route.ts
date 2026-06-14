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
import { updateAccount } from '@/lib/platform-store';
import { SecretConfigurationError } from '@/lib/secrets';
import { clearDomainAttached } from '@/lib/platform-store';
import { removeDomain } from '@/lib/vercel';
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

const ROUTE = '/api/account';

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);
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
}).strict();

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
    const account = await updateAccount(payload.account.id, parsed.data);

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
    // old host. We do not auto-attach the new one — that requires explicit
    // ownership verification via /api/domain/verify-ownership first.
    let detached = false;
    let detachError: string | null = null;
    const shouldDetach =
      previousAttachedHost &&
      previousAttachedHost !== currentHost;
    if (shouldDetach) {
      try {
        detached = await removeDomain(previousAttachedHost);
        await clearDomainAttached(payload.account.id);
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
      },
    });

    return NextResponse.json({ account, detached, detachError });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    if (err instanceof SecretConfigurationError) {
      return NextResponse.json({ error: 'Secret encryption is not configured.' }, { status: 500 });
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
