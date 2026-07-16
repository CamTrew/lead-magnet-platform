import { get } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { getAccountLogoSource } from '@/lib/platform-store';

const ROUTE = '/brand-logos/[accountId]';
const idSchema = z.string().uuid();
const CACHE_CONTROL =
  'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800, immutable';

function blobStoreId() {
  return process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID;
}

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === 'localhost' || value === '::1' || value === '[::1]' || value.startsWith('127.');
}

function liveLogoFallback(request: NextRequest, accountId: string) {
  if (!isLocalHostname(request.nextUrl.hostname)) return null;

  const fallbackUrl = new URL(`/brand-logos/${accountId}`, 'https://magnets.so');
  const version = request.nextUrl.searchParams.get('v');
  if (version) fallbackUrl.searchParams.set('v', version);
  return NextResponse.redirect(fallbackUrl, 307);
}

function dataLogoResponse(logoUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(logoUrl);
  if (!match) return new NextResponse('Not found', { status: 404 });

  const body = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  return new NextResponse(body, {
    headers: {
      'Cache-Control': CACHE_CONTROL,
      'Content-Length': String(body.length),
      'Content-Type': match[1].toLowerCase(),
      ETag: `"${createHash('sha256').update(body).digest('base64url')}"`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const start = Date.now();
  const { accountId: rawAccountId } = await params;
  const parsed = idSchema.safeParse(rawAccountId);
  if (!parsed.success) return new NextResponse('Not found', { status: 404 });

  const accountId = parsed.data;
  try {
    const source = await getAccountLogoSource(accountId);
    if (!source) return new NextResponse('Not found', { status: 404 });

    if (source.logoUrl.startsWith('data:')) return dataLogoResponse(source.logoUrl);

    const url = new URL(source.logoUrl);
    const isBlob = url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
    const isPrivateBlob = url.hostname.endsWith('.private.blob.vercel-storage.com');
    if (!isBlob || !isPrivateBlob) {
      const response = NextResponse.redirect(source.logoUrl, 307);
      response.headers.set('Cache-Control', CACHE_CONTROL);
      return response;
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
      const fallback = liveLogoFallback(request, accountId);
      if (fallback) return fallback;
    }

    const blob = await get(source.logoUrl, {
      access: 'private',
      storeId: blobStoreId(),
      ifNoneMatch: request.headers.get('if-none-match') || undefined,
    });
    if (!blob) return new NextResponse('Not found', { status: 404 });
    if (blob.statusCode === 304) {
      return new NextResponse(null, { status: 304, headers: { 'Cache-Control': CACHE_CONTROL } });
    }
    if (!blob.stream) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(blob.stream, {
      headers: {
        'Cache-Control': CACHE_CONTROL,
        'Content-Length': String(blob.blob.size),
        'Content-Type': blob.blob.contentType,
        ETag: blob.blob.etag,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const fallback = message.includes('No blob credentials found')
      ? liveLogoFallback(request, accountId)
      : null;
    if (fallback) return fallback;

    log.warn('Account logo proxy failed', {
      route: ROUTE,
      method: 'GET',
      status: 502,
      accountId,
      durationMs: Date.now() - start,
      extra: { error },
    });
    return new NextResponse('Logo could not be loaded', { status: 502 });
  }
}
