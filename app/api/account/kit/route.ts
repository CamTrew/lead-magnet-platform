import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { revokeKitToken } from '@/lib/kit';
import { log } from '@/lib/logger';
import { disconnectKitAccount, getAccountWithSecrets } from '@/lib/platform-store';
import { enforceRateLimits, rateLimitResponse, RateLimitError, requestIp } from '@/lib/rate-limit';

const ROUTE = '/api/account/kit';

export async function DELETE(request: NextRequest) {
  try {
    const payload = await requireDashboardPayload();
    await enforceRateLimits([
      { identifier: payload.user.id, limit: 12, scope: 'kit:disconnect:user', windowSeconds: 60 * 10 },
      { identifier: requestIp(request), limit: 30, scope: 'kit:disconnect:ip', windowSeconds: 60 * 10 },
    ]);

    const account = await getAccountWithSecrets(payload.account.id);
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    if (account.kitRefreshToken) {
      await revokeKitToken(account.kitRefreshToken, request.nextUrl.origin);
    }
    const updated = await disconnectKitAccount(payload.account.id);
    if (!updated) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    log.info('Kit account disconnected', {
      route: ROUTE,
      method: 'DELETE',
      status: 200,
      accountId: payload.account.id,
    });
    return NextResponse.json({ account: updated });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.error('Kit disconnect failed', {
      route: ROUTE,
      method: 'DELETE',
      status: 502,
      extra: { error },
    });
    return NextResponse.json(
      { error: 'Kit could not be disconnected right now. Please try again.' },
      { status: 502 }
    );
  }
}
