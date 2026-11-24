import { createHmac, randomInt } from 'node:crypto';
import { SecretConfigurationError } from './secrets';

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

export function generateVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function verificationKey() {
  const dedicated = process.env.MAGNETS_VERIFICATION_KEY;
  const key = (dedicated ?? process.env.MAGNETS_ENCRYPTION_KEY ?? process.env.DATA_ENCRYPTION_KEY)?.trim();
  if (!key || (dedicated !== undefined ? key.length < 32 : process.env.NODE_ENV === 'production' && key.length < 16)) {
    throw new SecretConfigurationError('Email verification needs a valid server-side MAGNETS_VERIFICATION_KEY (at least 32 characters).');
  }
  return key;
}

export function assertVerificationCodeConfiguration() {
  verificationKey();
}

function hashWithKey(email: string, code: string, key: string) {
  // Domain-separated, email-bound HMAC prevents offline guessing of a short code
  // from a database dump. Legacy high-entropy link hashes retain their old format.
  const hash = createHmac('sha256', key)
    .update(`magnets:email-verification:v1:${email.trim().toLowerCase()}:${code}`)
    .digest('hex');
  return `code-v1:${hash}`;
}

export function hashVerificationCode(email: string, code: string) {
  return hashWithKey(email, code, verificationKey());
}

export function verificationCodeHashes(email: string, code: string) {
  const hashes = [hashVerificationCode(email, code)];
  const legacy = (process.env.MAGNETS_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY)?.trim();
  // Codes already sent before introducing the dedicated key remain usable.
  if (process.env.MAGNETS_VERIFICATION_KEY && legacy && legacy.length >= 16) {
    const previous = hashWithKey(email, code, legacy);
    if (!hashes.includes(previous)) hashes.push(previous);
  }
  return hashes;
}
