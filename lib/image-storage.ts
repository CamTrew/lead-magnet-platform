// Blob stores have a fixed access mode. Private uploads use the existing
// account-logo, magnet-image and email-image proxy routes for public display.
export const IMAGE_BLOB_ACCESS = process.env.NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS === 'private'
  ? 'private' : 'public';
