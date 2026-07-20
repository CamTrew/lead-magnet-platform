import { del, head, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { parsePresignedUploadBody } from '@/lib/blob-upload-request';
import {
  HOSTED_RESOURCE_CONTENT_TYPES,
  hostedResourceContentType,
  hostedResourceContentTypeMatches,
  isHostedResourceBlobUrl,
  validateHostedResourceFile,
} from '@/lib/hosted-resources';
import { MAX_HOSTED_RESOURCE_BYTES } from '@/lib/limits';
import { log } from '@/lib/logger';
import {
  createHostedResource,
  deleteHostedResource,
  HostedResourceLimitError,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const ROUTE = '/api/hosted-resources/[id]';
const idSchema = z.string().uuid();
const recordResourceSchema = z.object({
  blobUrl: z.string().url(),
  name: z.string().trim().min(1).max(240),
  originalFilename: z.string().trim().min(1).max(240),
}).strict();

class HostedResourceRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HostedResourceRouteError';
    this.status = status;
  }
}

function blobStoreId() {
  // Hosted files must never fall back to the public image store. Vercel Blob
  // access mode is fixed when a store is created, so resources use a distinct
  // private store selected by this explicit id.
  const storeId = process.env.HOSTED_RESOURCES_BLOB_STORE_ID?.trim();
  if (!storeId) {
    throw new HostedResourceRouteError(
      'Resource storage is not available on this deployment yet. Contact support.',
      503
    );
  }
  return storeId;
}

function blobToken() {
  // This store is intentionally separate from the public image store. Passing
  // its token explicitly also makes local development work without a Vercel
  // OIDC token and prevents an accidental fallback to BLOB_READ_WRITE_TOKEN.
  return process.env.HOSTED_RESOURCES_READ_WRITE_TOKEN?.trim() || undefined;
}

function parseTokenPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { accountId?: unknown; resourceId?: unknown };
    if (typeof parsed.accountId !== 'string' || typeof parsed.resourceId !== 'string') return null;
    return { accountId: parsed.accountId, resourceId: parsed.resourceId };
  } catch {
    return null;
  }
}

function uploadStorageMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (
    error.message.includes('No blob credentials found')
    || error.message.includes('no storeId was found')
    || error.message.includes('BLOB_STORE_ID')
    || error.message.includes('HOSTED_RESOURCES_BLOB_STORE_ID')
    || error.message.includes('Missing webhook public key')
  ) {
    return 'Resource storage is not available on this deployment yet. Contact support.';
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid resource id' }, { status: 400 });
  }
  const resourceId = parsedId.data;
  const body = parsePresignedUploadBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }

  try {
    const response = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const payload = await getCurrentDashboardBase();
        if (!payload) throw new HostedResourceRouteError('Not authenticated', 401);

        await enforceRateLimits([
          {
            identifier: payload.user.id,
            limit: 60,
            scope: 'upload:hosted-resource:user',
            windowSeconds: 60 * 60,
          },
          {
            identifier: requestIp(request),
            limit: 120,
            scope: 'upload:hosted-resource:ip',
            windowSeconds: 60 * 60,
          },
        ]);

        const expectedPrefix = `hosted-resources/${payload.account.id}/${resourceId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new HostedResourceRouteError('Invalid upload path', 400);
        }

        return {
          token: await issueSignedToken({
            allowedContentTypes: [...HOSTED_RESOURCE_CONTENT_TYPES],
            maximumSizeInBytes: MAX_HOSTED_RESOURCE_BYTES,
            operations: ['put'],
            pathname,
            storeId: blobStoreId(),
            token: blobToken(),
          }),
          urlOptions: {
            addRandomSuffix: true,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
            tokenPayload: JSON.stringify({
              accountId: payload.account.id,
              resourceId,
            }),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = parseTokenPayload(tokenPayload);
        if (
          !parsed
          || parsed.resourceId !== resourceId
          || !isHostedResourceBlobUrl(blob.url, parsed.accountId, parsed.resourceId)
          || (blob.contentType && !HOSTED_RESOURCE_CONTENT_TYPES.includes(
            blob.contentType as (typeof HOSTED_RESOURCE_CONTENT_TYPES)[number]
          ))
        ) {
          throw new HostedResourceRouteError('Invalid upload callback', 400);
        }

        log.info('Hosted resource uploaded', {
          route: ROUTE,
          method: 'POST',
          status: 200,
          accountId: parsed.accountId,
          durationMs: Date.now() - start,
          extra: { resourceId },
        });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    const status = error instanceof HostedResourceRouteError ? error.status : 500;
    const message = error instanceof HostedResourceRouteError
      ? error.message
      : uploadStorageMessage(error) || 'The resource could not be uploaded.';
    log.warn('Hosted resource upload failed', {
      route: ROUTE,
      method: 'POST',
      status,
      durationMs: Date.now() - start,
      extra: { resourceId, error },
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
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid resource id' }, { status: 400 });
  }
  const resourceId = parsedId.data;

  try {
    const payload = await getCurrentDashboardBase();
    if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 60,
        scope: 'upload:hosted-resource-finalise:user',
        windowSeconds: 60 * 60,
      },
      {
        identifier: requestIp(request),
        limit: 120,
        scope: 'upload:hosted-resource-finalise:ip',
        windowSeconds: 60 * 60,
      },
    ]);

    const parsed = recordResourceSchema.safeParse(await request.json().catch(() => null));
    if (
      !parsed.success
      || !isHostedResourceBlobUrl(parsed.data.blobUrl, payload.account.id, resourceId)
    ) {
      return NextResponse.json({ error: 'Invalid uploaded resource' }, { status: 400 });
    }

    const blob = await head(parsed.data.blobUrl, {
      storeId: blobStoreId(),
      token: blobToken(),
    });
    if (!hostedResourceContentTypeMatches(parsed.data.originalFilename, blob.contentType)) {
      after(() => del(parsed.data.blobUrl, {
        storeId: blobStoreId(),
        token: blobToken(),
      }).catch(() => undefined));
      return NextResponse.json(
        { error: 'The file extension does not match the uploaded file type.' },
        { status: 400 }
      );
    }
    const contentType = hostedResourceContentType(parsed.data.originalFilename, blob.contentType);
    const validationError = validateHostedResourceFile({
      name: parsed.data.originalFilename,
      size: blob.size,
      type: contentType,
    });
    if (validationError || blob.size > MAX_HOSTED_RESOURCE_BYTES) {
      after(() => del(parsed.data.blobUrl, {
        storeId: blobStoreId(),
        token: blobToken(),
      }).catch(() => undefined));
      return NextResponse.json(
        { error: validationError || 'The resource is too large.' },
        { status: 400 }
      );
    }

    const resource = await createHostedResource({
      id: resourceId,
      accountId: payload.account.id,
      name: parsed.data.name,
      originalFilename: parsed.data.originalFilename,
      contentType,
      sizeBytes: blob.size,
      blobUrl: parsed.data.blobUrl,
    });

    log.info('Hosted resource recorded', {
      route: ROUTE,
      method: 'PUT',
      status: 200,
      userId: payload.user.id,
      accountId: payload.account.id,
      durationMs: Date.now() - start,
      extra: { resourceId },
    });
    return NextResponse.json({ resource });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof HostedResourceLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    log.warn('Hosted resource record failed', {
      route: ROUTE,
      method: 'PUT',
      status: 500,
      durationMs: Date.now() - start,
      extra: { resourceId, error },
    });
    return NextResponse.json(
      { error: uploadStorageMessage(error) || 'The upload finished, but the resource could not be saved.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid resource id' }, { status: 400 });
  }

  try {
    const payload = await getCurrentDashboardBase();
    if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await enforceRateLimits([{
      identifier: payload.user.id,
      limit: 120,
      scope: 'delete:hosted-resource:user',
      windowSeconds: 60 * 60,
    }]);

    const resource = await deleteHostedResource(payload.account.id, parsedId.data);
    if (!resource) return NextResponse.json({ error: 'Resource not found' }, { status: 404 });

    after(() => del(resource.blobUrl, {
      storeId: blobStoreId(),
      token: blobToken(),
    }).catch((error) => {
      log.warn('Hosted resource blob cleanup failed', {
        route: ROUTE,
        method: 'DELETE',
        accountId: payload.account.id,
        extra: { resourceId: parsedId.data, error },
      });
    }));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.warn('Hosted resource delete failed', {
      route: ROUTE,
      method: 'DELETE',
      status: 500,
      extra: { resourceId: parsedId.data, error },
    });
    return NextResponse.json({ error: 'The resource could not be deleted.' }, { status: 500 });
  }
}
