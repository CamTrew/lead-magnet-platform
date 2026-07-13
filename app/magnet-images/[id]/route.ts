import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardPayload } from '@/lib/auth';
import { log } from '@/lib/logger';
import { getLeadMagnetImageSource } from '@/lib/platform-store';

const ROUTE = '/magnet-images/[id]';
const PUBLISHED_IMAGE_CACHE_CONTROL =
  'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800, immutable';

const idSchema = z.string().uuid();

function blobAccessFromUrl(value: string): 'private' | 'public' {
  return value.includes('.private.blob.vercel-storage.com') ? 'private' : 'public';
}

function blobStoreId() {
  return process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID;
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

  try {
    const source = await getLeadMagnetImageSource(leadMagnetId);
    if (!source) {
      return new NextResponse('Not found', { status: 404 });
    }

    if (!source.published) {
      const payload = await getCurrentDashboardPayload();
      if (!payload || payload.account.id !== source.accountId) {
        return new NextResponse('Not found', { status: 404 });
      }
    }

    const blob = await get(source.imageUrl, {
      access: blobAccessFromUrl(source.imageUrl),
      storeId: blobStoreId(),
      ifNoneMatch: request.headers.get('if-none-match') || undefined,
    });

    if (!blob) {
      return new NextResponse('Not found', { status: 404 });
    }

    const cacheHeaders: Record<string, string> = source.published
      ? {
          // Vercel only retains dynamic route responses at the edge when an
          // explicit shared-cache lifetime is supplied. These image URLs are
          // versioned with the magnet update timestamp, so they are immutable.
          'Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
          'CDN-Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
          'Vercel-CDN-Cache-Control': PUBLISHED_IMAGE_CACHE_CONTROL,
        }
      : {
          'Cache-Control': 'private, no-store',
        };

    if (blob.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: cacheHeaders,
      });
    }

    if (!blob.stream) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(blob.stream, {
      headers: {
        ...cacheHeaders,
        'Content-Length': String(blob.blob.size),
        'Content-Type': blob.blob.contentType,
        ETag: blob.blob.etag,
      },
    });
  } catch (err) {
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
