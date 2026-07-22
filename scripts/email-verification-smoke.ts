import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  AuthActionError,
  createEmailVerificationForAddress,
  createLoginSession,
} from '../lib/auth';
import { consumeEmailVerificationToken } from '../lib/platform-store';
import { hashPassword } from '../lib/passwords';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const userId = randomUUID();
  const email = `verification-smoke-${userId}@example.com`;
  const password = 'verification-smoke-password';

  try {
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

  const tokenHash = `sha256:${createHash('sha256').update(verification.token).digest('hex')}`;
  assert.equal(await consumeEmailVerificationToken(tokenHash), userId);
  assert.equal(await consumeEmailVerificationToken(tokenHash), null, 'verification tokens must be single-use');

  const verified = await pool.query<{ emailVerified: boolean }>(
    `select "emailVerified" from neon_auth."user" where id = $1`,
    [userId]
  );
  assert.equal(verified.rows[0]?.emailVerified, true);

  console.log('Email verification smoke test passed: login gate, hashed token, expiry query, single use, and verification update.');
  } finally {
    await pool.query(`delete from public.magnets_email_verification_tokens where user_id = $1`, [userId]).catch(() => undefined);
    await pool.query(`delete from public.magnets_auth_credentials where user_id = $1`, [userId]).catch(() => undefined);
    await pool.query(`delete from neon_auth."user" where id = $1`, [userId]).catch(() => undefined);
    await pool.end();
  }
}

void main();
