import type { HandleUploadPresignedBody } from '@vercel/blob/client';

const allowedEventTypes = new Set([
  'blob.generate-presigned-url',
  'blob.upload-completed',
]);

export function parsePresignedUploadBody(value: unknown): HandleUploadPresignedBody | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as { type?: unknown; payload?: unknown };
  if (
    typeof candidate.type !== 'string' ||
    !allowedEventTypes.has(candidate.type) ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    return null;
  }

  return value as HandleUploadPresignedBody;
}
