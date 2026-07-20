import { NextResponse } from 'next/server';

const videoIdSchema = /^[a-zA-Z0-9_-]{6,20}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!videoIdSchema.test(id)) return new NextResponse('Not found', { status: 404 });

  try {
    // Email clients are inconsistent when proxying YouTube's image host.
    // Serving the same public thumbnail through magnets.so gives Gmail and
    // Outlook one stable, first-party HTTPS image URL without storing a copy.
    const upstream = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !upstream.body || !contentType.startsWith('image/')) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
