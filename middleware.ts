import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'magnets_session';
const MAX_API_REQUEST_BYTES = 3 * 1024 * 1024;

// API paths that are intentionally public (called from unauthenticated contexts).
// Everything else under /api requires a session cookie.
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/password-reset',
  '/api/submit',
  '/api/quiz-responses',
  '/api/calendar-webhooks',
];

const RESERVED_PUBLIC_PATHS = new Set([
  'api',
  'dashboard',
  'email-images',
  'favicon.ico',
  'forgot-password',
  'login',
  'magnet-images',
  'manifest.json',
  'p',
  'privacy',
  'register',
  'reset-password',
  'robots.txt',
  'sequence',
  'sitemap.xml',
  'terms',
]);

function isPublicApi(pathname: string) {
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  // Vercel Blob calls this route after a browser upload completes. The route
  // still requires a signed Blob callback or a dashboard session, depending on
  // the event type, so only this exact callback/token endpoint is public.
  return /^\/api\/lead-magnets\/[0-9a-f-]{36}\/(?:image|email-image)$/i.test(pathname);
}

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const publicApi = isPublicApi(pathname);
  const publicSegments = pathname.split('/').filter(Boolean);
  const isPublicMagnetPath =
    publicSegments.length > 0 &&
    publicSegments.length <= 2 &&
    !RESERVED_PUBLIC_PATHS.has(publicSegments[0].toLowerCase());

  if (isPublicMagnetPath && pathname !== pathname.toLowerCase()) {
    const lowercaseUrl = request.nextUrl.clone();
    lowercaseUrl.pathname = pathname.toLowerCase();
    return applySecurityHeaders(NextResponse.redirect(lowercaseUrl, 308), request);
  }

  if (pathname.startsWith('/api/')) {
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_API_REQUEST_BYTES) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Request is too large.' }, { status: 413 }),
        request
      );
    }
  }

  // Dashboard pages — redirect unauthenticated users to /login with a return URL.
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
      return applySecurityHeaders(NextResponse.redirect(loginUrl), request);
    }
  }

  // Authenticated API routes — return JSON 401 if there is no session cookie.
  if (pathname.startsWith('/api/') && !publicApi) {
    if (!hasSession) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
        request
      );
    }

    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (isMutation && request.headers.get('sec-fetch-site') === 'cross-site') {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 }),
        request
      );
    }
  }

  // Logged-in users hitting /login or /register — bounce them into the dashboard.
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard/pages', request.url)), request);
  }

  return applySecurityHeaders(NextResponse.next(), request);
}

export const config = {
  // Run on everything except Next internals, static files, and the public lead-magnet route ([slug]).
  // The [slug] page is the public capture page hosted at get.<customer>.com and must remain anonymous.
  // It's handled by Next's filesystem routing and gets the security headers via the catch-all branch below.
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (build assets)
     * - favicon, icon, apple-icon, manifest (metadata files)
     * - /api/submit (public form post — explicitly allowlisted above too)
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.json).*)',
  ],
};
