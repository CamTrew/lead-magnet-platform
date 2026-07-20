import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import {
  exchangeKitAuthorizationCode,
  getKitAccount,
  KIT_OAUTH_RETURN_COOKIE,
  KIT_OAUTH_STATE_COOKIE,
  safeKitPostInstallRedirect,
} from '@/lib/kit';
import { log } from '@/lib/logger';
import { saveKitConnection } from '@/lib/platform-store';

const ROUTE = '/api/account/kit/callback';

function safeStateMatch(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function dashboardRedirect(request: NextRequest, result: 'connected' | 'denied' | 'error') {
  const kitReturn = result === 'connected'
    ? safeKitPostInstallRedirect(request.cookies.get(KIT_OAUTH_RETURN_COOKIE)?.value || null)
    : '';
  const url = kitReturn
    ? new URL(kitReturn)
    : new URL(`/dashboard?kit=${result}`, request.nextUrl.origin);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: KIT_OAUTH_STATE_COOKIE, path: '/api/account/kit' });
  response.cookies.delete({ name: KIT_OAUTH_RETURN_COOKIE, path: '/api/account/kit' });
  return response;
}

export async function GET(request: NextRequest) {
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    accountId = payload.account.id;
    const expectedState = request.cookies.get(KIT_OAUTH_STATE_COOKIE)?.value || '';
    const receivedState = request.nextUrl.searchParams.get('state') || '';
    const code = request.nextUrl.searchParams.get('code')?.trim() || '';
    const providerError = request.nextUrl.searchParams.get('error');

    if (providerError) return dashboardRedirect(request, 'denied');
    if (!safeStateMatch(expectedState, receivedState) || !code || code.length > 2000) {
      log.warn('Kit OAuth callback rejected invalid state or code', {
        route: ROUTE,
        method: 'GET',
        status: 400,
        accountId,
      });
      return dashboardRedirect(request, 'error');
    }

    const tokens = await exchangeKitAuthorizationCode({
      code,
      origin: request.nextUrl.origin,
    });
    const kitAccount = await getKitAccount(tokens.accessToken);
    await saveKitConnection({
      accountId,
      ...tokens,
      kitAccountId: kitAccount.id,
      kitAccountName: kitAccount.name,
    });

    log.info('Kit account connected', {
      route: ROUTE,
      method: 'GET',
      status: 302,
      accountId,
      extra: { kitAccountId: kitAccount.id },
    });
    return dashboardRedirect(request, 'connected');
  } catch (error) {
    log.error('Kit OAuth callback failed', {
      route: ROUTE,
      method: 'GET',
      status: 502,
      accountId,
      extra: { error },
    });
    return dashboardRedirect(request, 'error');
  }
}
