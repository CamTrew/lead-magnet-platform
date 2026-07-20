import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { log } from '@/lib/logger';
import { getAccountWithSecrets } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { SecretConfigurationError } from '@/lib/secrets';
import { sendZapierTestWebhook, ZapierWebhookError } from '@/lib/zapier';

const ROUTE = '/api/account/zapier/test';

export async function POST(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 10,
        scope: 'account:zapier:test:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 20,
        scope: 'account:zapier:test:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const account = await getAccountWithSecrets(payload.account.id);
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    await sendZapierTestWebhook(account);

    log.info('Zapier test webhook sent', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId: payload.user.id,
      accountId: account.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof ZapierWebhookError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SecretConfigurationError) {
      return NextResponse.json(
        { error: 'Secure account storage is not configured. Contact support before connecting Zapier.' },
        { status: 500 }
      );
    }

    log.error('Zapier test webhook failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      extra: { error },
    });
    return NextResponse.json({ error: 'Could not send a Zapier test webhook.' }, { status: 500 });
  }
}
