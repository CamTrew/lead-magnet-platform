import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { getAccountWithSecrets } from '@/lib/platform-store';
import { PipedriveError, testPipedriveConnection } from '@/lib/pipedrive';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { SecretConfigurationError } from '@/lib/secrets';
import { log } from '@/lib/logger';

const ROUTE = '/api/account/pipedrive/test';

export async function POST(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      { identifier: payload.user.id, limit: 10, scope: 'account:pipedrive:test:user', windowSeconds: 300 },
      { identifier: requestIp(request), limit: 20, scope: 'account:pipedrive:test:ip', windowSeconds: 300 },
    ]);
    const account = await getAccountWithSecrets(payload.account.id);
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    await testPipedriveConnection(account);
    log.info('Pipedrive connection tested', { route: ROUTE, method: 'POST', status: 200, userId: payload.user.id, accountId: account.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof PipedriveError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SecretConfigurationError) {
      return NextResponse.json({ error: 'Secure account storage is not configured. Contact support before connecting Pipedrive.' }, { status: 500 });
    }
    log.error('Pipedrive connection test failed', { route: ROUTE, method: 'POST', status: 500, extra: { error } });
    return NextResponse.json({ error: 'Could not test the Pipedrive connection.' }, { status: 500 });
  }
}
