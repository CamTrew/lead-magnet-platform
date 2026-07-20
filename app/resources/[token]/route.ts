import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hostedResourceContentDisposition } from '@/lib/hosted-resources';
import { log } from '@/lib/logger';
import { getHostedResourceSourceByToken } from '@/lib/platform-store';

const tokenSchema = z.string().uuid();
// Do not CDN-cache shared resources: deleting the database row must revoke the
// public link immediately, even if the private Blob itself is cleaned up later.
const CACHE_CONTROL = 'private, no-store';

function blobStoreId() {
  const storeId = process.env.HOSTED_RESOURCES_BLOB_STORE_ID?.trim();
  if (!storeId) throw new Error('Hosted resource private Blob store is not configured.');
  return storeId;
}

function blobToken() {
  return process.env.HOSTED_RESOURCES_READ_WRITE_TOKEN?.trim() || undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;
  const parsedToken = tokenSchema.safeParse(rawToken);
  if (!parsedToken.success) return new NextResponse('Not found', { status: 404 });

  const resource = await getHostedResourceSourceByToken(parsedToken.data);
  if (!resource) return new NextResponse('Not found', { status: 404 });
  const inlinePreview = request.nextUrl.searchParams.get('preview') === '1'
    && resource.contentType.startsWith('image/');

  try {
    const blob = await get(resource.blobUrl, {
      access: 'private',
      storeId: blobStoreId(),
      token: blobToken(),
      ifNoneMatch: request.headers.get('if-none-match') || undefined,
    });
    if (!blob) return new NextResponse('Not found', { status: 404 });

    const headers = {
      'Cache-Control': CACHE_CONTROL,
      'Content-Disposition': inlinePreview
        ? 'inline'
        : hostedResourceContentDisposition(resource.originalFilename),
      'X-Content-Type-Options': 'nosniff',
    };
    if (blob.statusCode === 304) return new NextResponse(null, { status: 304, headers });
    if (!blob.stream) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(blob.stream, {
      headers: {
        ...headers,
        'Content-Length': String(blob.blob.size),
        'Content-Type': resource.contentType || blob.blob.contentType,
        ETag: blob.blob.etag,
      },
    });
  } catch (error) {
    log.warn('Hosted resource download failed', {
      route: '/resources/[token]',
      method: 'GET',
      status: 404,
      accountId: resource.accountId,
      extra: { resourceId: resource.id, error },
    });
    return new NextResponse('Not found', { status: 404 });
  }
}
