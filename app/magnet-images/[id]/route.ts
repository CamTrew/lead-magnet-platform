import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardPayload } from '@/lib/auth';
import {
  createLeadMagnetDisplayImage,
  isLeadMagnetDisplayImageUrl,
} from '@/lib/lead-magnet-display-image';
import { log } from '@/lib/logger';
import { getLeadMagnetImageSource, updateLeadMagnetImageUrl } from '@/lib/platform-store';

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
  if (process.env.NODE_ENV === 'production') return null;

  const liveSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so').replace(/\/$/, '');
  const fallbackUrl = new URL(`/magnet-images/${leadMagnetId}`, liveSiteUrl);
  const version = request.nextUrl.searchParams.get('v');
  if (version) fallbackUrl.searchParams.set('v', version);

  return NextResponse.redirect(fallbackUrl, 307);
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
      const payload = await getCurrentDashboardPayload();
      if (!payload || payload.account.id !== source.accountId) {
        return new NextResponse('Not found', { status: 404 });
      }
    }

    if (isLeadMagnetDisplayImageUrl(source.imageUrl)) {
      return streamBlob(request, source.imageUrl, source.published);
    }

    try {
      // Upgrade legacy originals once to a page-sized rendition. Private Blob
      // stores stay private and are served through this edge-cached route.
      const displayImageUrl = await createLeadMagnetDisplayImage({
        accountId: source.accountId,
        leadMagnetId,
        sourceUrl: source.imageUrl,
      });
      const updated = await updateLeadMagnetImageUrl(
        source.accountId,
        leadMagnetId,
        displayImageUrl
      );
      if (!updated) throw new Error('Could not record the display image.');

      if (blobAccessFromUrl(displayImageUrl) === 'public') {
        return NextResponse.redirect(displayImageUrl, 307);
      }

      return streamBlob(request, displayImageUrl, source.published);
    } catch (conversionError) {
      // Conversion is an optimization, never a requirement for rendering an
      // existing lead magnet. Keep serving the original if it cannot migrate.
      log.warn('Lead magnet display image conversion failed', {
        route: ROUTE,
        method: 'GET',
        status: 200,
        accountId: source.accountId,
        durationMs: Date.now() - start,
        extra: { leadMagnetId, error: conversionError },
      });
      return streamBlob(request, source.imageUrl, source.published);
    }
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
