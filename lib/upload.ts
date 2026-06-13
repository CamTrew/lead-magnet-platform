/**
 * Server-side validation for the logo data URL the dashboard sends us.
 *
 * The dashboard reads a chosen file with FileReader.readAsDataURL() and puts the
 * resulting string on account.logoUrl. We have to assume the client could send
 * anything (custom curl, modified bundle, etc) and validate the bytes themselves
 * — not the MIME the client claims, and never trusting the file extension.
 *
 * Allowed images: PNG, JPG, WebP, GIF. SVG is rejected because data:image/svg+xml
 * with an embedded <script> would run inside <img> via XSS-equivalent vectors.
 */

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Magic bytes for the allowed types. Checked against the first few bytes of the
// decoded payload — the client cannot lie about these.
const MAGIC_BYTES: Array<{ type: string; bytes: number[] }> = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF87a or GIF89a
  // WebP: "RIFF....WEBP". Checked manually below because the four bytes between
  // RIFF and WEBP are the file size and vary.
];

export const MAX_LOGO_BYTES = 1_000_000; // 1 MB
export const MAX_LOGO_DATA_URL_LENGTH = Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 256; // base64 overhead + header

export type LogoValidationError =
  | 'empty'
  | 'too_large'
  | 'bad_format'
  | 'mime_not_allowed'
  | 'content_mismatch';

export type LogoValidationResult =
  | { ok: true; mime: string; bytes: number }
  | { ok: false; reason: LogoValidationError };

function matchesMagic(buffer: Buffer, magic: number[]) {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

function isWebp(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  );
}

function detectMime(buffer: Buffer): string | null {
  for (const { type, bytes } of MAGIC_BYTES) {
    if (matchesMagic(buffer, bytes)) return type;
  }
  if (isWebp(buffer)) return 'image/webp';
  return null;
}

/**
 * Validates a logo data URL. Returns { ok: true, mime, bytes } on success, or
 * { ok: false, reason } on failure. The empty string is accepted and treated as
 * "no logo" (callers can pass through unchanged).
 */
export function validateLogoDataUrl(value: string): LogoValidationResult {
  if (!value) return { ok: true, mime: '', bytes: 0 };

  if (value.length > MAX_LOGO_DATA_URL_LENGTH) {
    return { ok: false, reason: 'too_large' };
  }

  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    return { ok: false, reason: 'bad_format' };
  }

  const claimedMime = match[1].trim().toLowerCase();
  const payload = match[2].replace(/\s+/g, '');

  if (!ALLOWED_TYPES.has(claimedMime)) {
    return { ok: false, reason: 'mime_not_allowed' };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, 'base64');
  } catch {
    return { ok: false, reason: 'bad_format' };
  }

  if (buffer.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const detectedMime = detectMime(buffer);
  if (!detectedMime) {
    return { ok: false, reason: 'content_mismatch' };
  }
  if (detectedMime !== claimedMime) {
    return { ok: false, reason: 'content_mismatch' };
  }

  return { ok: true, mime: detectedMime, bytes: buffer.length };
}

const ERROR_MESSAGES: Record<LogoValidationError, string> = {
  empty: 'The logo file is empty.',
  too_large: 'The logo must be 1 MB or smaller.',
  bad_format: 'Re-upload the logo. We could not read the file you provided.',
  mime_not_allowed: 'Logo must be a PNG, JPG, WebP, or GIF. SVG is not supported.',
  content_mismatch: 'That file does not look like the image type it claims to be.',
};

export function logoValidationMessage(reason: LogoValidationError) {
  return ERROR_MESSAGES[reason];
}
