import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  CalendarIntegrationError,
  createCalendarBookingWebhook,
} from '@/lib/calendar-integrations';
import {
  getAccountWithSecrets,
  getOrCreateCalendarWebhookToken,
  updateCalendarIntegration,
} from '@/lib/platform-store';
import {
  clearRateLimits,
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { isMaskedSecret, SecretConfigurationError } from '@/lib/secrets';
import { log } from '@/lib/logger';

const ROUTE = '/api/account/calendar';

const schema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['', 'calendly', 'calcom']),
  apiKey: z.string().max(2000).optional().default(''),
  webhookSecret: z.string().max(2000).optional().default(''),
}).strict();

function calendarWebhookOrigin(request: NextRequest) {
  const rawOrigin = (
    process.env.CALENDAR_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.nextUrl.origin
  ).trim();

  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new CalendarIntegrationError(
      'Use an HTTPS app URL before connecting a calendar. Localhost cannot receive Calendly or Cal.com webhooks.'
    );
  }

  if (url.protocol !== 'https:') {
    throw new CalendarIntegrationError(
      'Use an HTTPS app URL before connecting a calendar. Localhost cannot receive Calendly or Cal.com webhooks.'
    );
  }

  return url.origin;
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 20,
        scope: 'account:calendar:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 40,
        scope: 'account:calendar:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue?.path?.[0] === 'provider'
        ? 'Choose Calendly or Cal.com.'
        : issue?.message || 'Check the calendar fields and try again.';
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    if (!parsed.data.enabled) {
      const account = await updateCalendarIntegration(payload.account.id, {
        enabled: false,
        provider: '',
      });
      if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

      return NextResponse.json({ account });
    }

    if (!parsed.data.provider) {
      return NextResponse.json({ error: 'Choose Calendly or Cal.com.' }, { status: 400 });
    }

    const existingAccount = await getAccountWithSecrets(payload.account.id);
    if (!existingAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const apiKey =
      isMaskedSecret(parsed.data.apiKey) && existingAccount.calendarProvider === parsed.data.provider
        ? existingAccount.calendarApiKey
        : parsed.data.apiKey.trim();

    if (!apiKey || isMaskedSecret(apiKey)) {
      return NextResponse.json({ error: 'Paste the API token for this calendar provider.' }, { status: 400 });
    }

    const webhookSecret =
      parsed.data.provider === 'calcom'
        ? isMaskedSecret(parsed.data.webhookSecret)
          ? existingAccount.calendarWebhookSecret || randomBytes(24).toString('hex')
          : parsed.data.webhookSecret.trim() || randomBytes(24).toString('hex')
        : '';

    const token = await getOrCreateCalendarWebhookToken(payload.account.id);
    if (!token) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const webhookUrl = `${calendarWebhookOrigin(request)}/api/calendar-webhooks/${payload.account.id}?token=${encodeURIComponent(token)}`;
    const webhookId = await createCalendarBookingWebhook({
      apiKey,
      provider: parsed.data.provider,
      webhookSecret,
      webhookUrl,
    });

    const account = await updateCalendarIntegration(payload.account.id, {
      enabled: true,
      provider: parsed.data.provider,
      apiKey,
      webhookSecret,
      webhookId,
      connectedAt: new Date(),
    });
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    await clearRateLimits(['calendar-webhook:account'], payload.account.id).catch(() => undefined);

    log.info('Calendar integration connected', {
      route: ROUTE,
      method: 'PUT',
      status: 200,
      userId: payload.user.id,
      accountId: payload.account.id,
      extra: {
        provider: parsed.data.provider,
        webhookId,
      },
    });

    return NextResponse.json({ account });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }

    if (err instanceof CalendarIntegrationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (err instanceof SecretConfigurationError) {
      return NextResponse.json(
        { error: 'Secure account storage is not configured. Contact support before connecting a calendar.' },
        { status: 500 }
      );
    }

    log.error('Calendar integration update failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not update calendar integration' }, { status: 500 });
  }
}
