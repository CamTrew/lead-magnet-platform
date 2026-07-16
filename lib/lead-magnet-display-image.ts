import { randomUUID } from 'node:crypto';
import { get, put } from '@vercel/blob';
import sharp from 'sharp';

const DISPLAY_WIDTH = 1200;
const DISPLAY_HEIGHT = 750;
const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const MAX_SOURCE_PIXELS = 32 * 1024 * 1024;

export function isLegacyCloudinaryImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

export function isLeadMagnetDisplayImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.endsWith('.blob.vercel-storage.com') &&
      decodeURIComponent(url.pathname).includes('/display/');
  } catch {
    return false;
  }
}

function blobStoreId() {
  return process.env.BLOB_STORE_ID || process.env.VERCEL_BLOB_STORE_ID;
}

function blobAccessFromUrl(value: string): 'private' | 'public' {
  return value.includes('.private.blob.vercel-storage.com') ? 'private' : 'public';
}

async function readBlob(url: string) {
  if (url.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(url);
    if (!match) throw new Error('The legacy image data is invalid.');
    return Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  }

  // Older accounts stored their uploads in Cloudinary. Keep that path readable
  // while the background migration replaces it with a display Blob.
  if (isLegacyCloudinaryImageUrl(url)) {
    const response = await fetch(url, {
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('The legacy image could not be read.');
    return Buffer.from(await response.arrayBuffer());
  }

  const blob = await get(url, {
    access: blobAccessFromUrl(url),
    storeId: blobStoreId(),
  });

  if (!blob?.stream) {
    throw new Error('The uploaded image could not be read from storage.');
  }

  const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
  return buffer;
}

/**
 * Stores a small, fixed display rendition for public lead magnet pages.
 * The source Blob is intentionally left untouched, so the original upload is
 * still retained in storage instead of being destructively compressed.
 */
export async function createLeadMagnetDisplayImage({
  accountId,
  leadMagnetId,
  sourceUrl,
}: {
  accountId: string;
  leadMagnetId: string;
  sourceUrl: string;
}) {
  const buffer = await readBlob(sourceUrl);
  const access = sourceUrl.startsWith('data:') ? 'private' : blobAccessFromUrl(sourceUrl);
  const pathname = `lead-magnets/${accountId}/${leadMagnetId}/display/${randomUUID()}`;

  const displayBuffer = await sharp(buffer, {
    failOn: 'none',
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .rotate()
    .resize(DISPLAY_WIDTH, DISPLAY_HEIGHT, {
      fit: 'cover',
      position: 'attention',
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const blob = await put(`${pathname}.webp`, displayBuffer, {
    // Blob stores have a fixed access mode. Existing accounts use the private
    // store, so attempting to create a public rendition there fails. Preserve
    // the source access and let the image route stream private renditions.
    access,
    cacheControlMaxAge: YEAR_IN_SECONDS,
    contentType: 'image/webp',
    storeId: blobStoreId(),
  });

  return blob.url;
}
