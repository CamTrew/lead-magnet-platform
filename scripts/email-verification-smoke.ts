import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  AuthActionError,
  createEmailVerificationForAddress,
  createLoginSession,
  createRegistration,
} from '../lib/auth';
import { assertVerificationCodeConfiguration, hashVerificationCode, verificationCodeHashes } from '../lib/email-verification-code';
import { consumeEmailVerificationToken, createEmailVerificationToken } from '../lib/platform-store';
import { hashPassword } from '../lib/passwords';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const db = new URL(databaseUrl);
assert.equal(db.hostname, '127.0.0.1');
assert.equal(db.port, '55439');
assert.equal(db.pathname, '/magnets_staging_test');

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const userId = randomUUID();
  const email = `verification-smoke-${userId}@example.com`;
  const password = 'verification-smoke-password';
  const registrationEmail = `registration-smoke-${userId}@example.com`;
  const missingKeyEmail = `missing-key-${userId}@example.com`;
  let registeredId: string | undefined;

  try {
  const originalKey = process.env.MAGNETS_VERIFICATION_KEY;
  process.env.MAGNETS_VERIFICATION_KEY = 'too-short';
  try {
    assert.throws(assertVerificationCodeConfiguration, /verification/i);
    await assert.rejects(() => createRegistration(missingKeyEmail, password, 'No write'), /verification/i);
    assert.equal((await pool.query('select id from neon_auth."user" where email = $1', [missingKeyEmail])).rowCount, 0, 'invalid configuration must not leave an account behind');
  } finally {
    if (originalKey === undefined) delete process.env.MAGNETS_VERIFICATION_KEY;
    else process.env.MAGNETS_VERIFICATION_KEY = originalKey;
  }

  // Resume the actual registration path after an interrupted verification step.
  const registration = await createRegistration(registrationEmail, password, 'Registration smoke');
  registeredId = registration.id;
  assert.equal((await createRegistration(registrationEmail, password, 'Do not rename')).id, registeredId);
  await assert.rejects(() => createRegistration(registrationEmail, 'different-password', 'Wrong password'), (error: unknown) => error instanceof AuthActionError && error.status === 409);
  const registrationCode = await createEmailVerificationForAddress(registrationEmail);
  assert.ok(registrationCode);
  assert.equal(await consumeEmailVerificationToken(hashVerificationCode(registrationEmail, registrationCode.code)), registeredId);
  await assert.rejects(() => createRegistration(registrationEmail, password, 'Already verified'), (error: unknown) => error instanceof AuthActionError && error.status === 409);

  const previousKey = process.env.MAGNETS_ENCRYPTION_KEY;
  const dedicatedKey = process.env.MAGNETS_VERIFICATION_KEY;
  try {
    process.env.MAGNETS_ENCRYPTION_KEY = 'legacy-verification-test-key-long-enough';
    delete process.env.MAGNETS_VERIFICATION_KEY;
    const legacyCodeHash = hashVerificationCode(email, '123456');
    process.env.MAGNETS_VERIFICATION_KEY = 'dedicated-verification-test-key-long-enough';
    assert.notEqual(hashVerificationCode(email, '123456'), legacyCodeHash);
    assert.ok(verificationCodeHashes(email, '123456').includes(legacyCodeHash));
    process.env.MAGNETS_ENCRYPTION_KEY = 'short';
    assert.doesNotThrow(() => hashVerificationCode(email, '123456'), 'dedicated key works independently of the integration key');
  } finally {
    if (previousKey === undefined) delete process.env.MAGNETS_ENCRYPTION_KEY;
    else process.env.MAGNETS_ENCRYPTION_KEY = previousKey;
    if (dedicatedKey === undefined) delete process.env.MAGNETS_VERIFICATION_KEY;
    else process.env.MAGNETS_VERIFICATION_KEY = dedicatedKey;
  }
  await pool.query(
    `insert into neon_auth."user" (id, email, name, "emailVerified") values ($1, $2, 'Verification smoke', false)`,
    [userId, email]
  );
  await pool.query(
    `insert into public.magnets_auth_credentials (user_id, password_hash) values ($1, $2)`,
    [userId, await hashPassword(password)]
  );

  await assert.rejects(
    () => createLoginSession(email, password),
    (error: unknown) => error instanceof AuthActionError
      && error.code === 'email_verification_required'
      && error.status === 403
  );

  const verification = await createEmailVerificationForAddress(email);
  assert.ok(verification);
  assert.equal(verification.email, email);
  assert.equal(await consumeEmailVerificationToken('sha256:not-the-token'), null);

  assert.match(verification.code, /^\d{6}$/);
  const firstHash = hashVerificationCode(email, verification.code);
  assert.equal(await consumeEmailVerificationToken(hashVerificationCode('other@example.com', verification.code)), null);
  const replacement = await createEmailVerificationForAddress(email);
  assert.ok(replacement);
  const tokenHash = hashVerificationCode(email, replacement.code);
  if (tokenHash !== firstHash) assert.equal(await consumeEmailVerificationToken(firstHash), null, 'resend must replace the code');
  await pool.query('update public.magnets_email_verification_tokens set expires_at = now() - interval \'1 second\' where token_hash = $1', [tokenHash]);
  assert.equal(await consumeEmailVerificationToken(tokenHash), null, 'expired codes cannot verify');
  const fresh = await createEmailVerificationForAddress(email);
  assert.ok(fresh);
  const freshHash = hashVerificationCode(email, fresh.code);
  const outcomes = await Promise.all([consumeEmailVerificationToken(freshHash), consumeEmailVerificationToken(freshHash)]);
  assert.equal(outcomes.filter(Boolean).length, 1, 'concurrent confirmation must succeed once');
  assert.equal(outcomes.find(Boolean), userId);
  assert.equal(await consumeEmailVerificationToken(freshHash), null, 'codes must be single use');
  assert.equal(await createEmailVerificationForAddress(email), null, 'verified users cannot request another code');
  assert.equal(await createEmailVerificationForAddress(`absent-${email}`), null);

  // Existing high-entropy links remain usable; consuming one also invalidates codes.
  await pool.query('update neon_auth."user" set "emailVerified" = false where id = $1', [userId]);
  const legacyHash = `sha256:${createHash('sha256').update(randomUUID()).digest('hex')}`;
  await createEmailVerificationToken(userId, legacyHash, new Date(Date.now() + 60000));
  const alongsideLink = await createEmailVerificationForAddress(email);
  assert.ok(alongsideLink);
  assert.equal(await consumeEmailVerificationToken(legacyHash), userId);
  assert.equal(await consumeEmailVerificationToken(hashVerificationCode(email, alongsideLink.code)), null);

  const verified = await pool.query<{ emailVerified: boolean }>(
    `select "emailVerified" from neon_auth."user" where id = $1`,
    [userId]
  );
  assert.equal(verified.rows[0]?.emailVerified, true);

  console.log('Email verification smoke test passed: registration preflight, safe retries, dedicated/legacy keys, login gate, email-bound codes, resend replacement, expiry, concurrent single use, legacy links, and verification update.');
  } finally {
    if (registeredId) {
      await pool.query('delete from public.magnets_email_verification_tokens where user_id = $1', [registeredId]);
      await pool.query('delete from public.magnets_accounts where owner_user_id = $1', [registeredId]);
      await pool.query('delete from public.magnets_auth_credentials where user_id = $1', [registeredId]);
      await pool.query('delete from neon_auth."user" where id = $1', [registeredId]);
    }
    await pool.query(`delete from public.magnets_email_verification_tokens where user_id = $1`, [userId]).catch(() => undefined);
    await pool.query(`delete from public.magnets_auth_credentials where user_id = $1`, [userId]).catch(() => undefined);
    await pool.query(`delete from neon_auth."user" where id = $1`, [userId]).catch(() => undefined);
    await pool.end();
  }
}

void main().finally(async () => { await globalThis.magnetsPgPool?.end(); });
