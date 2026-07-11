import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardPayload } from '@/lib/auth';
import {
  isAccountEmailImageBlobUrl,
  publicEmailImageUrl,
} from '@/lib/email-image-proxy';
import { log } from '@/lib/logger';
import { MAX_MAGNET_IMAGE_BYTES } from '@/lib/upload';

const ROUTE = '/api/lead-magnets/[id]/email-image';

const idSchema = z.string().uuid();
const allowedContentTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const finaliseImageSchema = z.object({
  blobUrl: z.string().url(),
}).strict();

class UploadRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadRouteError';
    this.status = status;
  }
}

function parseTokenPayload(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { accountId?: unknown; leadMagnetId?: unknown };
    if (typeof parsed.accountId !== 'string' || typeof parsed.leadMagnetId !== 'string') {
      return null;
    }
    return { accountId: parsed.accountId, leadMagnetId: parsed.leadMagnetId };
  } catch {
    return null;
  }
}

function isAllowedBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id: rawId } = await params;
  const idParse = idSchema.safeParse(rawId);
  if (!idParse.success) {
    return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
  }
  const leadMagnetId = idParse.data;

  const body = (await request.json().catch(() => null)) as HandleUploadPresignedBody | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  try {
    const response = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const payload = await getCurrentDashboardPayload();
        if (!payload) {
          throw new UploadRouteError('Not authenticated', 401);
        }

        if (!payload.leadMagnets.some((leadMagnet) => leadMagnet.id === leadMagnetId)) {
          throw new UploadRouteError('Lead magnet not found', 404);
        }

        const expectedPrefix = `lead-magnets/${payload.account.id}/${leadMagnetId}/email-images/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new UploadRouteError('Invalid upload path', 400);
        }

        return {
          token: await issueSignedToken({
            allowedContentTypes,
            maximumSizeInBytes: MAX_MAGNET_IMAGE_BYTES,
            operations: ['put'],
            pathname,
            storeId: process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID,
          }),
          urlOptions: {
            addRandomSuffix: true,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
            tokenPayload: JSON.stringify({
              accountId: payload.account.id,
              leadMagnetId,
            }),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = parseTokenPayload(tokenPayload);
        if (!parsed) {
          throw new UploadRouteError('Invalid upload callback', 400);
        }
        if (!isAllowedBlobUrl(blob.url)) {
          throw new UploadRouteError('Invalid uploaded image URL', 400);
        }
        if (blob.contentType && !allowedContentTypes.includes(blob.contentType)) {
          throw new UploadRouteError('Invalid uploaded image type', 400);
        }

        log.info('Email image uploaded', {
          route: ROUTE,
          method: 'POST',
          status: 200,
          accountId: parsed.accountId,
          durationMs: Date.now() - start,
          extra: { leadMagnetId: parsed.leadMagnetId },
        });
      },
    });

    return NextResponse.json(response);
  } catch (err) {
    const missingBlobStore =
      err instanceof Error &&
      (err.message.includes('No blob credentials found') ||
        err.message.includes('no storeId was found') ||
        err.message.includes('BLOB_STORE_ID'));
    const missingWebhookKey =
      err instanceof Error && err.message.includes('Missing webhook public key');
    const status = err instanceof UploadRouteError ? err.status : 500;
    const message = err instanceof UploadRouteError
      ? err.message
      : missingBlobStore || missingWebhookKey
        ? 'Image storage is not available on this deployment yet. Try again after the next deploy, or contact support.'
        : 'Image could not be uploaded';

    log.warn('Email image upload failed', {
      route: ROUTE,
      method: 'POST',
      status,
      durationMs: Date.now() - start,
      extra: { leadMagnetId, error: err },
    });

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id: rawId } = await params;
  const idParse = idSchema.safeParse(rawId);
  if (!idParse.success) {
    return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
  }
  const leadMagnetId = idParse.data;

  try {
    const payload = await getCurrentDashboardPayload();
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!payload.leadMagnets.some((leadMagnet) => leadMagnet.id === leadMagnetId)) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = finaliseImageSchema.safeParse(body);
    if (
      !parsed.success ||
      !isAccountEmailImageBlobUrl(parsed.data.blobUrl, payload.account.id, leadMagnetId)
    ) {
      return NextResponse.json({ error: 'Invalid uploaded image URL' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const imageUrl = publicEmailImageUrl(parsed.data.blobUrl, baseUrl);

    log.info('Email image ready', {
      route: ROUTE,
      method: 'PUT',
      status: 200,
      userId: payload.user.id,
      accountId: payload.account.id,
      durationMs: Date.now() - start,
      extra: { leadMagnetId },
    });

    return NextResponse.json({ imageUrl });
  } catch (err) {
    log.warn('Email image finalisation failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      durationMs: Date.now() - start,
      extra: { leadMagnetId, error: err },
    });
    return NextResponse.json({ error: 'Image could not be prepared for email' }, { status: 500 });
  }
}
