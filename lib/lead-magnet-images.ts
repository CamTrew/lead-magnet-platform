const CLOUDINARY_UPLOAD_MARKER = '/image/upload/';
const CLOUDINARY_PUBLIC_HOST = 'res.cloudinary.com';
const CLOUDINARY_LEAD_MAGNET_WIDTHS = [640, 960, 1200] as const;
const CLOUDINARY_LEAD_MAGNET_TRANSFORM_RE = /\/image\/upload\/f_auto,q_auto,w_\d+,c_fill,ar_16:10\//;

function cloudinaryLeadMagnetTransform(width: number) {
  return `f_auto,q_auto,w_${width},c_fill,ar_16:10`;
}

export function isCloudinaryImageUrl(imageUrl: string) {
  if (!imageUrl) return false;

  try {
    const url = new URL(imageUrl);
    return url.hostname === CLOUDINARY_PUBLIC_HOST && url.pathname.includes(CLOUDINARY_UPLOAD_MARKER);
  } catch {
    return false;
  }
}

export function optimiseLeadMagnetImageUrl(imageUrl: string, width = 1200) {
  if (!isCloudinaryImageUrl(imageUrl)) return imageUrl;

  const transform = cloudinaryLeadMagnetTransform(width);
  const optimisedUploadMarker = `${CLOUDINARY_UPLOAD_MARKER}${transform}/`;
  if (imageUrl.includes(optimisedUploadMarker)) return imageUrl;

  if (CLOUDINARY_LEAD_MAGNET_TRANSFORM_RE.test(imageUrl)) {
    return imageUrl.replace(CLOUDINARY_LEAD_MAGNET_TRANSFORM_RE, optimisedUploadMarker);
  }

  return imageUrl.replace(CLOUDINARY_UPLOAD_MARKER, optimisedUploadMarker);
}

export function leadMagnetImageSrcSet(imageUrl: string) {
  if (!isCloudinaryImageUrl(imageUrl)) return undefined;

  return CLOUDINARY_LEAD_MAGNET_WIDTHS
    .map((width) => `${optimiseLeadMagnetImageUrl(imageUrl, width)} ${width}w`)
    .join(', ');
}

/**
 * Private Blob URLs cannot be loaded by a visitor's browser. Keep newer public
 * uploads direct, but route legacy private uploads through our access-aware
 * image endpoint instead.
 */
export function leadMagnetDisplayImageUrl({
  id,
  imageUrl,
  updatedAt,
}: {
  id: string;
  imageUrl: string;
  updatedAt?: string;
}) {
  if (imageUrl.includes('.private.blob.vercel-storage.com')) {
    const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
    return `/magnet-images/${id}${version}`;
  }

  return optimiseLeadMagnetImageUrl(imageUrl);
}
