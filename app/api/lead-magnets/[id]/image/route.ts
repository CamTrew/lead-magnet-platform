import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardPayload } from '@/lib/auth';
import { log } from '@/lib/logger';
import {
  findLeadMagnetForAccount,
  updateLeadMagnetImageUrl,
} from '@/lib/platform-store';
import { MAX_MAGNET_IMAGE_BYTES } from '@/lib/upload';

const ROUTE = '/api/lead-magnets/[id]/image';

const idSchema = z.string().uuid();
const allowedContentTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Image storage is not configured yet. Add BLOB_READ_WRITE_TOKEN in Vercel and redeploy.' },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const payload = await getCurrentDashboardPayload();
        if (!payload) {
          throw new UploadRouteError('Not authenticated', 401);
        }

        const leadMagnet = await findLeadMagnetForAccount(payload.account.id, leadMagnetId);
        if (!leadMagnet) {
          throw new UploadRouteError('Lead magnet not found', 404);
        }

        const expectedPrefix = `lead-magnets/${payload.account.id}/${leadMagnetId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new UploadRouteError('Invalid upload path', 400);
        }

        return {
          addRandomSuffix: true,
          allowedContentTypes,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
          maximumSizeInBytes: MAX_MAGNET_IMAGE_BYTES,
          tokenPayload: JSON.stringify({
            accountId: payload.account.id,
            leadMagnetId,
          }),
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

        await updateLeadMagnetImageUrl(parsed.accountId, parsed.leadMagnetId, blob.url);

        log.info('Lead magnet image uploaded', {
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
    const status = err instanceof UploadRouteError ? err.status : 500;
    const message = err instanceof UploadRouteError
      ? err.message
      : 'Image could not be uploaded';

    log.warn('Lead magnet image upload failed', {
      route: ROUTE,
      method: 'POST',
      status,
      durationMs: Date.now() - start,
      extra: { leadMagnetId, error: err },
    });

    return NextResponse.json({ error: message }, { status });
  }
}
