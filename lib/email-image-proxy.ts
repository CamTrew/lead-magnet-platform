import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  emailImageMarkdown,
  emailImageRowMarkdown,
  parseEmailBodySegments,
} from './email-body-images';

const TOKEN_VERSION = 1;

type EmailImagePayload = {
  v: typeof TOKEN_VERSION;
  u: string;
};

function signingSecret() {
  const raw = process.env.MAGNETS_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
  if (raw?.trim()) return raw.trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MAGNETS_ENCRYPTION_KEY is required to sign email image links.');
  }

  return 'dev-only-email-image-secret';
}

function sign(value: string) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isVercelBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function isPrivateVercelBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function isAccountEmailImageBlobUrl(
  value: string,
  accountId: string,
  leadMagnetId: string
) {
  if (!isVercelBlobUrl(value)) return false;

  try {
    const pathname = decodeURIComponent(new URL(value).pathname).replace(/^\//, '');
    return pathname.startsWith(`lead-magnets/${accountId}/${leadMagnetId}/email-images/`);
  } catch {
    return false;
  }
}

export function createEmailImageToken(blobUrl: string) {
  if (!isPrivateVercelBlobUrl(blobUrl)) {
    throw new Error('Only private Vercel Blob images need a proxy token.');
  }

  const payload = Buffer.from(
    JSON.stringify({ v: TOKEN_VERSION, u: blobUrl } satisfies EmailImagePayload),
    'utf8'
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

export function verifyEmailImageToken(token: string) {
  const [payloadValue, signature] = token.split('.');
  if (!payloadValue || !signature || !safeEqual(sign(payloadValue), signature)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadValue, 'base64url').toString('utf8')
    ) as Partial<EmailImagePayload>;
    if (
      parsed.v !== TOKEN_VERSION ||
      typeof parsed.u !== 'string' ||
      !isPrivateVercelBlobUrl(parsed.u)
    ) {
      return null;
    }
    return parsed.u;
  } catch {
    return null;
  }
}

export function publicEmailImageUrl(blobUrl: string, baseUrl: string) {
  if (!isPrivateVercelBlobUrl(blobUrl)) return blobUrl;
  return new URL(`/email-images/${createEmailImageToken(blobUrl)}`, baseUrl).toString();
}

export function proxyEmailImagesInBody({
  accountId,
  baseUrl,
  body,
  leadMagnetId,
}: {
  accountId: string;
  baseUrl: string;
  body: string;
  leadMagnetId: string;
}) {
  return parseEmailBodySegments(body)
    .map((segment) => {
      if (segment.kind === 'image-row') {
        return emailImageRowMarkdown(segment.images.map((image) => {
          if (
            !isPrivateVercelBlobUrl(image.url) ||
            !isAccountEmailImageBlobUrl(image.url, accountId, leadMagnetId)
          ) {
            return image;
          }

          return {
            ...image,
            url: publicEmailImageUrl(image.url, baseUrl),
          };
        }));
      }

      if (
        segment.kind !== 'image' ||
        !isPrivateVercelBlobUrl(segment.url) ||
        !isAccountEmailImageBlobUrl(segment.url, accountId, leadMagnetId)
      ) {
        return segment.raw;
      }

      return emailImageMarkdown({
        alt: segment.alt,
        border: segment.border,
        caption: segment.caption,
        url: publicEmailImageUrl(segment.url, baseUrl),
      });
    })
    .join('');
}
