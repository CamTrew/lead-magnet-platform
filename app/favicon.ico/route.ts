import { NextResponse } from 'next/server';
import { isPlatformHost, leadMagnetFaviconUrl } from '@/lib/favicon';
import { findAccountByAttachedHost } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

function faviconImageResponse(logoUrl: string) {
  if (/^https?:\/\//i.test(logoUrl)) {
    return NextResponse.redirect(logoUrl, 302);
  }

  const match = logoUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;

  const mime = match[1].trim().toLowerCase();
  const body = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');

  if (!body.length) return null;

  return new NextResponse(body, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export async function GET(request: Request) {
  const host = request.headers.get('host') || '';
  const account = isPlatformHost(host) ? null : await findAccountByAttachedHost(host);
  const faviconUrl = account ? leadMagnetFaviconUrl(account) : null;
  const faviconResponse = faviconUrl ? faviconImageResponse(faviconUrl) : null;

  return faviconResponse || NextResponse.redirect(new URL('/brand/magnets-mark-dark.png', request.url), 302);
}
