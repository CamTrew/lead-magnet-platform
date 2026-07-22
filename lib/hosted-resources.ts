import { MAX_HOSTED_RESOURCE_BYTES } from './limits';

// Browser MIME values are advisory. Server routes must validate the extension,
// the normalized MIME, the account/resource-scoped blob pathname, and the blob
// URL returned by Vercel before inserting metadata. The private blob URL is not
// a sharing URL; customers share the revocable /resources/[publicToken] route.
export const HOSTED_RESOURCE_CONTENT_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const HOSTED_RESOURCE_ACCEPT = [
  '.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
].join(',');

const allowedContentTypes = new Set<string>(HOSTED_RESOURCE_CONTENT_TYPES);
const allowedExtensions = new Set(HOSTED_RESOURCE_ACCEPT.split(','));
const contentTypeByExtension: Record<string, (typeof HOSTED_RESOURCE_CONTENT_TYPES)[number]> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

export function hostedResourceExtension(filename: string) {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]{1,10})$/);
  return match?.[1] || '';
}

export function hostedResourceContentType(filename: string, browserContentType = '') {
  const expected = contentTypeByExtension[hostedResourceExtension(filename)];
  if (!expected) return '';
  if (browserContentType === 'application/x-zip-compressed' && expected === 'application/zip') {
    return browserContentType;
  }
  return expected;
}

export function hostedResourceContentTypeMatches(filename: string, contentType: string) {
  const expected = contentTypeByExtension[hostedResourceExtension(filename)];
  if (!expected) return false;
  return contentType === expected
    || (expected === 'application/zip' && contentType === 'application/x-zip-compressed');
}

export function validateHostedResourceFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  if (!file.name.trim() || file.name.length > 240) return 'Use a filename under 240 characters.';
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > MAX_HOSTED_RESOURCE_BYTES) return 'Files must be 50 MB or smaller.';
  if (!allowedExtensions.has(hostedResourceExtension(file.name))) {
    return 'Upload a PDF, ZIP, document, spreadsheet, presentation, text file, or image.';
  }
  if (!allowedContentTypes.has(hostedResourceContentType(file.name, file.type))) {
    return 'This file type is not supported.';
  }
  return null;
}

export function safeHostedResourceFilename(filename: string) {
  const extension = hostedResourceExtension(filename);
  const stem = filename
    .slice(0, extension ? -extension.length : undefined)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'resource';
  return `${stem}${extension}`;
}

export function hostedResourcePathname(
  accountId: string,
  resourceId: string,
  filename: string
) {
  // Account and resource ids in the path are an ownership check used again
  // when the upload callback is accepted. Do not collapse this to /filename.
  return `hosted-resources/${accountId}/${resourceId}/${safeHostedResourceFilename(filename)}`;
}

export function isHostedResourceBlobUrl(
  value: string,
  accountId: string,
  resourceId: string
) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/^\//, '');
    return url.protocol === 'https:'
      && url.hostname.endsWith('.private.blob.vercel-storage.com')
      && pathname.startsWith(`hosted-resources/${accountId}/${resourceId}/`);
  } catch {
    return false;
  }
}

export function hostedResourcePublicPath(publicToken: string) {
  return `/resources/${publicToken}`;
}

export function hostedResourceTypeLabel(contentType: string, filename: string) {
  const extension = hostedResourceExtension(filename).replace('.', '').toUpperCase();
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.includes('zip')) return 'ZIP';
  if (contentType.startsWith('image/')) return extension || 'Image';
  return extension || 'File';
}

export function formatHostedResourceBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
  }
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function hostedResourceContentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').slice(0, 180) || 'resource';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
