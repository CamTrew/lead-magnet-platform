import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentDashboardPayload } from '@/lib/auth';
import { log } from '@/lib/logger';
import { MAX_LOGO_BYTES } from '@/lib/upload';

const ROUTE = '/api/account/logo';
const allowedContentTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

class UploadRouteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HandleUploadPresignedBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });

  try {
    const response = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const payload = await getCurrentDashboardPayload();
        if (!payload) throw new UploadRouteError('Not authenticated.', 401);

        const expectedPrefix = `brand-logos/${payload.account.id}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new UploadRouteError('Invalid upload path.', 400);
        }

        return {
          token: await issueSignedToken({
            allowedContentTypes,
            maximumSizeInBytes: MAX_LOGO_BYTES,
            operations: ['put'],
            pathname,
            storeId: process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID,
          }),
          urlOptions: {
            addRandomSuffix: true,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
          },
        };
      },
      onUploadCompleted: async ({ blob }) => {
        if (
          !blob.url.includes('.blob.vercel-storage.com') ||
          (blob.contentType && !allowedContentTypes.includes(blob.contentType))
        ) {
          throw new UploadRouteError('Invalid logo upload.', 400);
        }
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof UploadRouteError
      ? error.message
      : 'Logo storage is not available on this deployment yet. Try again after the next deploy, or contact support.';
    const status = error instanceof UploadRouteError ? error.status : 500;
    log.warn('Logo upload failed', { route: ROUTE, method: 'POST', status, extra: { error } });
    return NextResponse.json({ error: message }, { status });
  }
}
