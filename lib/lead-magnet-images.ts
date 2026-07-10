const CLOUDINARY_UPLOAD_MARKER = '/image/upload/';
const CLOUDINARY_PUBLIC_HOST = 'res.cloudinary.com';
const CLOUDINARY_LEAD_MAGNET_TRANSFORM = 'f_auto,q_auto,w_1200,c_fill,ar_16:10';

export function optimiseLeadMagnetImageUrl(imageUrl: string) {
  if (!imageUrl) return imageUrl;

  try {
    const url = new URL(imageUrl);
    if (url.hostname !== CLOUDINARY_PUBLIC_HOST || !url.pathname.includes(CLOUDINARY_UPLOAD_MARKER)) {
      return imageUrl;
    }
  } catch {
    return imageUrl;
  }

  const optimisedUploadMarker = `${CLOUDINARY_UPLOAD_MARKER}${CLOUDINARY_LEAD_MAGNET_TRANSFORM}/`;
  if (imageUrl.includes(optimisedUploadMarker)) return imageUrl;

  return imageUrl.replace(CLOUDINARY_UPLOAD_MARKER, optimisedUploadMarker);
}
