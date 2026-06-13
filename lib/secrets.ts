import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Envelope for stored integration secrets:
 *
 *   enc:v1:<iv-base64url>:<auth-tag-base64url>:<ciphertext-base64url>
 *
 * Encryption: AES-256-GCM with a 12-byte random IV. Key is derived as
 * SHA-256 of MAGNETS_ENCRYPTION_KEY (or DATA_ENCRYPTION_KEY as legacy fallback).
 *
 * Plaintext never touches the database. We refuse to encrypt or decrypt if the
 * encryption key is not configured — there is no silent plaintext fallback,
 * even in development. Set MAGNETS_ENCRYPTION_KEY in .env.local. A throwaway
 * value like `dev-only-secret` is fine for local work.
 */

const encryptedPrefix = 'enc:v1:';
export const maskedSecret = '********';

export class SecretConfigurationError extends Error {
  constructor(message?: string) {
    super(
      message ||
        'MAGNETS_ENCRYPTION_KEY is not set. Add it to .env.local (any long random string) before saving integration secrets.'
    );
    this.name = 'SecretConfigurationError';
  }
}

function encryptionKey() {
  const raw = process.env.MAGNETS_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  // Reject obviously trivial keys in production. We can't catch a weak key
  // entirely (entropy isn't measurable from one string), but we can stop the
  // dumb cases: empty after trim, or shorter than 16 chars.
  const trimmed = raw.trim();
  if (process.env.NODE_ENV === 'production' && trimmed.length < 16) {
    throw new SecretConfigurationError(
      'MAGNETS_ENCRYPTION_KEY is too short for production use (need at least 16 characters).'
    );
  }
  if (!trimmed) return null;
  return createHash('sha256').update(trimmed).digest();
}

export function isMaskedSecret(value: string | undefined) {
  return value === maskedSecret;
}

export function hasEncryptedSecret(value: string | undefined) {
  return Boolean(value?.startsWith(encryptedPrefix));
}

export function encryptSecret(value: string | undefined) {
  const cleanValue = value?.trim() || '';
  if (!cleanValue) return cleanValue;
  if (cleanValue.startsWith(encryptedPrefix)) return cleanValue;

  const key = encryptionKey();
  if (!key) {
    // No silent plaintext storage, ever. The previous behaviour wrote the raw
    // Resend/Beehiiv key into Postgres when NODE_ENV !== 'production', which
    // meant a misconfigured deploy or a forgotten env var on a dev box could
    // leak credentials. Refuse instead — the caller surfaces this as a 500.
    throw new SecretConfigurationError();
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(cleanValue, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    encryptedPrefix.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(value: string | undefined) {
  const cleanValue = value || '';
  if (!cleanValue) return cleanValue;
  if (!cleanValue.startsWith(encryptedPrefix)) {
    // A non-empty value that doesn't carry the envelope means either:
    //  (a) a legacy row written under the old plaintext-fallback behaviour, or
    //  (b) corruption / direct DB write.
    // Either way, we refuse to return the raw bytes — pretend it's empty so
    // callers fall back to "no key configured" rather than ship a stale or
    // unverifiable secret out to Resend.
    return '';
  }

  const key = encryptionKey();
  if (!key) {
    throw new SecretConfigurationError();
  }

  const [, , ivValue, tagValue, ciphertextValue] = cleanValue.split(':');
  if (!ivValue || !tagValue || !ciphertextValue) return '';

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // GCM auth-tag mismatch lands here — either the ciphertext was tampered
    // with or the encryption key rotated. Either way, do not throw a usable
    // error chain to the caller; the route surfaces "secret unavailable".
    return '';
  }
}

export function redactSecret(value: string | undefined) {
  return value ? maskedSecret : '';
}
