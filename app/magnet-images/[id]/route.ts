import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardPayload } from '@/lib/auth';
import { createLeadMagnetDisplayImage } from '@/lib/lead-magnet-display-image';
import { log } from '@/lib/logger';
import { getLeadMagnetImageSource, updateLeadMagnetImageUrl } from '@/lib/platform-store';

const ROUTE = '/magnet-images/[id]';
const idSchema = z.string().uuid();

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

    // Legacy private Blob images used to be streamed through this route on
    // every public page view. Upgrade once to a public, page-sized rendition,
    // then send the browser straight to Blob's CDN from now on.
    const displayImageUrl = await createLeadMagnetDisplayImage({
      accountId: source.accountId,
      leadMagnetId,
      sourceUrl: source.imageUrl,
    });
    const updated = await updateLeadMagnetImageUrl(source.accountId, leadMagnetId, displayImageUrl);
    if (!updated) return new NextResponse('Not found', { status: 404 });

    return NextResponse.redirect(displayImageUrl, 307);
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
