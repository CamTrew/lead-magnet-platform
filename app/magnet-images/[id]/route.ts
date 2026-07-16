import { get } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import {
  createLeadMagnetDisplayImage,
  isLegacyCloudinaryImageUrl,
  isLeadMagnetDisplayImageUrl,
} from '@/lib/lead-magnet-display-image';
import { log } from '@/lib/logger';
import { getLeadMagnetImageSource, updateLeadMagnetImageUrl } from '@/lib/platform-store';
import { invalidatePublishedLeadMagnetCache } from '@/lib/public-lead-magnet-cache';
import { enforceRateLimits, RateLimitError } from '@/lib/rate-limit';

const ROUTE = '/magnet-images/[id]';
const idSchema = z.string().uuid();
const PUBLISHED_IMAGE_CACHE_CONTROL =
  'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800, immutable';

function blobAccessFromUrl(value: string): 'private' | 'public' {
  return value.includes('.private.blob.vercel-storage.com') ? 'private' : 'public';
}

function blobStoreId() {
  return process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID;
}

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === 'localhost' || value === '::1' || value === '[::1]' || value.startsWith('127.');
}

function liveImageOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return 'https://magnets.so';

  try {
    const url = new URL(configured);
    return isLocalHostname(url.hostname) ? 'https://magnets.so' : url.origin;
  } catch {
    return 'https://magnets.so';
  }
}

async function streamBlob(
  request: NextRequest,
  imageUrl: string,
  published: boolean
) {
  const blob = await get(imageUrl, {
    access: blobAccessFromUrl(imageUrl),
    storeId: blobStoreId(),
    ifNoneMatch: request.headers.get('if-none-match') || undefined,
  });

  if (!blob) return new NextResponse('Not found', { status: 404 });

  const cacheHeaders: Record<string, string> = published
    ? {
        'Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
        'CDN-Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
        'Vercel-CDN-Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
      }
    : { 'Cache-Control': 'private, no-store' };

  if (blob.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  if (!blob.stream) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      ...cacheHeaders,
      'Content-Length': String(blob.blob.size),
      'Content-Type': blob.blob.contentType,
      ETag: blob.blob.etag,
    },
  });
}

function localPublishedImageFallback(request: NextRequest, leadMagnetId: string) {
  // `next start` sets NODE_ENV=production even on a developer's machine. Use
  // the request host so local production builds still fall back to the live
  // public image proxy when local Blob credentials are intentionally absent.
  if (!isLocalHostname(request.nextUrl.hostname)) return null;

  const fallbackUrl = new URL(`/magnet-images/${leadMagnetId}`, liveImageOrigin());
  const version = request.nextUrl.searchParams.get('v');
  if (version) fallbackUrl.searchParams.set('v', version);

  return NextResponse.redirect(fallbackUrl, 307);
}

function legacyDataImageResponse(imageUrl: string, published: boolean) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(imageUrl);
  if (!match) return new NextResponse('Not found', { status: 404 });

  const body = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  const cacheControl = published ? PUBLISHED_IMAGE_CACHE_CONTROL : 'private, no-store';

  return new NextResponse(body, {
    headers: {
      'Cache-Control': cacheControl,
      'CDN-Cache-Control': cacheControl,
      'Content-Length': String(body.length),
      'Content-Type': match[1].toLowerCase(),
      ETag: `"${createHash('sha256').update(body).digest('base64url')}"`,
    },
  });
}

function legacyCloudinaryImageResponse(imageUrl: string, published: boolean) {
  const response = NextResponse.redirect(imageUrl, 307);
  response.headers.set(
    'Cache-Control',
    published ? PUBLISHED_IMAGE_CACHE_CONTROL : 'private, no-store'
  );
  return response;
}

async function migrateDisplayImage(source: {
  accountId: string;
  id: string;
  imageUrl: string;
}) {
  try {
    const displayImageUrl = await createLeadMagnetDisplayImage({
      accountId: source.accountId,
      leadMagnetId: source.id,
      sourceUrl: source.imageUrl,
    });
    const updated = await updateLeadMagnetImageUrl(
      source.accountId,
      source.id,
      displayImageUrl
    );
    if (!updated) throw new Error('Could not record the display image.');
    invalidatePublishedLeadMagnetCache();
  } catch (conversionError) {
    log.warn('Lead magnet display image conversion failed', {
      route: ROUTE,
      method: 'GET',
      accountId: source.accountId,
      extra: { leadMagnetId: source.id, error: conversionError },
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id: rawId } = await params;
  const idParse = idSchema.safeParse(rawId);
  if (!idParse.success) {
    return new NextResponse('Not found', { status: 404 });
  }

  const leadMagnetId = idParse.data;
  let isPublished = false;

  try {
    const source = await getLeadMagnetImageSource(leadMagnetId);
    if (!source) {
      return new NextResponse('Not found', { status: 404 });
    }
    isPublished = source.published;

    if (!source.published) {
      const payload = await getCurrentDashboardBase();
      if (!payload || payload.account.id !== source.accountId) {
        return new NextResponse('Not found', { status: 404 });
      }
    }

    if (
      source.published &&
      source.imageUrl.includes('.private.blob.vercel-storage.com') &&
      !process.env.BLOB_READ_WRITE_TOKEN &&
      !process.env.VERCEL_OIDC_TOKEN
    ) {
      const fallback = localPublishedImageFallback(request, leadMagnetId);
      if (fallback) return fallback;
    }

    if (isLeadMagnetDisplayImageUrl(source.imageUrl)) {
      return streamBlob(request, source.imageUrl, source.published);
    }

    // Never hold up the visitor while creating a smaller rendition. Serve the
    // existing image immediately, then replace it in storage after the response.
    if (blobStoreId()) {
      try {
        await enforceRateLimits([{
          identifier: leadMagnetId,
          limit: 1,
          scope: 'magnet-image:migration',
          windowSeconds: 10 * 60,
        }]);
        after(() => migrateDisplayImage({
          accountId: source.accountId,
          id: leadMagnetId,
          imageUrl: source.imageUrl,
        }));
      } catch (migrationLimitError) {
        if (!(migrationLimitError instanceof RateLimitError)) throw migrationLimitError;
      }
    }

    if (source.imageUrl.startsWith('data:')) {
      return legacyDataImageResponse(source.imageUrl, source.published);
    }

    if (isLegacyCloudinaryImageUrl(source.imageUrl)) {
      return legacyCloudinaryImageResponse(source.imageUrl, source.published);
    }

    return streamBlob(request, source.imageUrl, source.published);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const fallback = isPublished && message.includes('No blob credentials found')
      ? localPublishedImageFallback(request, leadMagnetId)
      : null;

    if (fallback) return fallback;

    log.warn('Lead magnet image proxy failed', {
      route: ROUTE,
      method: 'GET',
      status: 502,
      durationMs: Date.now() - start,
      extra: { leadMagnetId, error: err },
    });

    return new NextResponse('Image could not be loaded', { status: 502 });
  }
}
