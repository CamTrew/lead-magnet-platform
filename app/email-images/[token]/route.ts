import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { verifyEmailImageToken } from '@/lib/email-image-proxy';
import { log } from '@/lib/logger';

const ROUTE = '/email-images/[token]';

function blobStoreId() {
  return process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const start = Date.now();
  const { token } = await params;
  const blobUrl = verifyEmailImageToken(token);
  if (!blobUrl) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const blob = await get(blobUrl, {
      access: 'private',
      storeId: blobStoreId(),
    });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(blob.stream, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(blob.blob.size),
        'Content-Type': blob.blob.contentType,
      },
    });
  } catch (err) {
    log.warn('Email image proxy failed', {
      route: ROUTE,
      method: 'GET',
      status: 502,
      durationMs: Date.now() - start,
      extra: { error: err },
    });
    return new NextResponse('Image could not be loaded', { status: 502 });
  }
}
