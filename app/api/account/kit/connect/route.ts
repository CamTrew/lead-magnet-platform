import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentDashboardBase } from '@/lib/auth';
import {
  KIT_OAUTH_RETURN_COOKIE,
  KIT_OAUTH_STATE_COOKIE,
  kitAuthorizationUrl,
  KitConfigurationError,
  safeKitPostInstallRedirect,
} from '@/lib/kit';
import { log } from '@/lib/logger';
import { enforceRateLimits, rateLimitResponse, RateLimitError, requestIp } from '@/lib/rate-limit';

const ROUTE = '/api/account/kit/connect';
export async function GET(request: NextRequest) {
  try {
    const payload = await getCurrentDashboardBase();
    if (!payload) {
      const loginUrl = new URL('/login', request.nextUrl.origin);
      loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    await enforceRateLimits([
      { identifier: payload.user.id, limit: 12, scope: 'kit:connect:user', windowSeconds: 60 * 10 },
      { identifier: requestIp(request), limit: 30, scope: 'kit:connect:ip', windowSeconds: 60 * 10 },
    ]);

    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = kitAuthorizationUrl({ state, origin: request.nextUrl.origin });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(KIT_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: '/api/account/kit',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    const postInstallRedirect = safeKitPostInstallRedirect(
      request.nextUrl.searchParams.get('redirect')
    );
    if (postInstallRedirect) {
      response.cookies.set(KIT_OAUTH_RETURN_COOKIE, postInstallRedirect, {
        httpOnly: true,
        maxAge: 10 * 60,
        path: '/api/account/kit',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    const message = error instanceof KitConfigurationError
      ? 'Kit is not configured on Magnets yet.'
      : 'Kit could not be connected right now.';
    log.error('Kit OAuth start failed', {
      route: ROUTE,
      method: 'GET',
      status: error instanceof KitConfigurationError ? 503 : 500,
      extra: { error },
    });
    return NextResponse.json(
      { error: message },
      { status: error instanceof KitConfigurationError ? 503 : 500 }
    );
  }
}
