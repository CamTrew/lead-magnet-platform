import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const db = new URL(databaseUrl);
  assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.port, '55439');
  assert.equal(db.pathname, '/magnets_staging_test');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const base = 'http://127.0.0.1:3108';
  const prefix = randomUUID();
  const emails = [`otp-${prefix}@example.invalid`, `limit-${prefix}@example.invalid`];
  const ip = `verification-test-${prefix}`;
  async function post(path: string, body: object) {
    return fetch(`${base}/api/auth/${path}`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-forwarded-for': ip,
    }, body: JSON.stringify(body) });
  }
  function emailedCode(email: string) {
    // The local Resend interceptor must be preloaded into the test server.
    const messages = readFileSync('.data/local-email-requests.jsonl', 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const message = messages.filter((item) => item.to === email || item.to?.includes(email)).at(-1);
    assert.ok(message, 'verification email must be sent');
    assert.ok(!message.text.includes('/verify-email/confirm'), 'new emails must not send a link');
    const code = message.text.match(/code: (\d{6})/)?.[1];
    assert.ok(code);
    assert.ok(message.html.includes(code));
    return code as string;
  }
  try {
    for (const email of emails) {
      const response = await post('register', { email, password: 'Local-code-test-only!', name: 'Local code test', acceptedTerms: true });
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('set-cookie'), null, 'registration must not create a verified session');
      const responseBody = await response.json();
      assert.equal(responseBody.verificationRequired, true);
      assert.equal(responseBody.code, undefined, 'code must only be delivered by email');
    }
    const email = emails[0];
    const first = emailedCode(email);
    const wrong = first === '000000' ? '999999' : '000000';
    assert.equal((await post('email-verification/confirm', { email, code: wrong })).status, 400);
    assert.equal((await post('email-verification/confirm', { email, code: '123' })).status, 400);
    assert.equal((await post('email-verification/resend', { email })).status, 200);
    const fresh = emailedCode(email);
    if (fresh !== first) assert.equal((await post('email-verification/confirm', { email, code: first })).status, 400);
    const verified = await post('email-verification/confirm', { email, code: fresh });
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get('set-cookie') || '', /magnets_session=.*HttpOnly/i);
    assert.equal((await post('email-verification/confirm', { email, code: fresh })).status, 400);
    const sessionCookie = verified.headers.get('set-cookie')!.split(';')[0];
    const dashboard = await fetch(`${base}/create`, { headers: { cookie: sessionCookie }, redirect: 'manual' });
    assert.equal(dashboard.status, 200, 'verified session reaches creation workspace');

    const limitedEmail = emails[1];
    const correct = emailedCode(limitedEmail);
    const bad = correct === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await post('email-verification/confirm', { email: limitedEmail, code: bad })).status, 400);
    await post('email-verification/resend', { email: limitedEmail });
    const blocked = await post('email-verification/confirm', { email: limitedEmail, code: emailedCode(limitedEmail) });
    assert.equal(blocked.status, 429, 'resend must not reset the email attempt limit');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.headers.get('set-cookie'), null);
    console.log('Verification HTTP smoke passed: code-only email, invalid/replaced codes, verified session, replay rejection, and persistent attempt limit.');
  } finally {
    const users = await pool.query('select id from neon_auth."user" where email = any($1::text[])', [emails]);
    for (const { id } of users.rows) {
      await pool.query('delete from public.magnets_email_verification_tokens where user_id = $1', [id]);
      await pool.query('delete from public.magnets_auth_credentials where user_id = $1', [id]);
      await pool.query('delete from neon_auth.session where "userId" = $1', [id]);
      await pool.query('delete from public.magnets_accounts where owner_user_id = $1', [id]);
      await pool.query('delete from neon_auth."user" where id = $1', [id]);
    }
    const identifiers = [...emails, ip].map((value) => createHash('sha256').update(value.toLowerCase()).digest('hex'));
    await pool.query('delete from public.magnets_rate_limits where identifier_hash = any($1::text[])', [identifiers]);
    await pool.end();
  }
}
void main();
