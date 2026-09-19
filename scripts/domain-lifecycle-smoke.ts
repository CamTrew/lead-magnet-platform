import assert from 'node:assert/strict';
import {
  buildDomainOwnershipRecord,
  buildPageDnsRecords,
} from '../lib/dns-records';
import { syncProjectDomain, verifyDomain, VercelApiError } from '../lib/vercel';

process.env.VERCEL_API_TOKEN = 'test-token';
process.env.VERCEL_PROJECT_ID = 'test-project';

const requests: string[] = [];
let failDetach = false;

globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  const method = init?.method || 'GET';
  requests.push(method);

  if (method === 'DELETE' && failDetach) {
    return new Response(
      JSON.stringify({ error: { code: 'test_failure', message: 'detach failed' } }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (method === 'POST') return new Response('{}', { status: 201 });

  return new Response(
    JSON.stringify({ verified: true, verification: [] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}) as typeof fetch;

async function main() {
  const ownershipRecord = buildDomainOwnershipRecord(
    'Example.COM.',
    'magnets-verify-test-token'
  );
  assert.deepEqual(ownershipRecord, {
    id: 'page-txt',
    type: 'TXT',
    name: 'magnets-verify',
    lookupName: 'magnets-verify.example.com',
    value: 'magnets-verify-test-token',
  });
  assert.deepEqual(
    buildPageDnsRecords({
      domain: 'example.com',
      subdomain: 'get',
      verificationToken: 'magnets-verify-test-token',
    })[1],
    ownershipRecord,
    'The dashboard record and verification lookup must share one hostname.'
  );

  const replaced = await syncProjectDomain({
    previous: ['old.example.com'],
    current: ['new.example.com'],
  });
  assert.equal(replaced.errors.length, 0);
  assert.equal(replaced.detached[0], 'old.example.com');
  assert.equal(replaced.attached[0], 'new.example.com');
  assert.equal(requests[0], 'DELETE', 'The old hostname must be removed before replacement.');
  assert.equal(requests.includes('POST'), true);

  requests.length = 0;
  failDetach = true;
  const blocked = await syncProjectDomain({
    previous: ['old.example.com'],
    current: ['new.example.com'],
  });
  assert.equal(blocked.errors.length, 1);
  assert.deepEqual(requests, ['DELETE'], 'A failed cleanup must prevent the replacement attach.');

  let verified = false;
  let verificationError = false;
  let missing = false;
  const verificationRequests: Array<{ url: string; method: string }> = [];
  process.env.VERCEL_TEAM_ID = 'test-team';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    verificationRequests.push({ url, method });
    assert.equal(new URL(url).searchParams.get('teamId'), 'test-team');
    if (missing) return new Response('{}', { status: 404 });
    if (method === 'POST') {
      assert.equal(new URL(url).pathname, '/v9/projects/test-project/domains/get.example.com/verify');
      if (verificationError) {
        return new Response(JSON.stringify({ error: { code: 'verification_failed', message: 'TXT missing' } }), { status: 400 });
      }
      verified = true;
    }
    return Response.json({ verified, verification: verified ? [] : [{
      type: 'TXT', domain: '_vercel.example.com', value: 'challenge', reason: 'pending_domain_verification',
    }] });
  }) as typeof fetch;

  const completed = await verifyDomain('get.example.com');
  assert.equal(completed?.verified, true, 'An explicit POST must complete a pending TXT challenge.');
  assert.deepEqual(verificationRequests.map((r) => r.method), ['GET', 'POST', 'GET']);
  assert.deepEqual(completed?.verification, [], 'Return refreshed records after verification.');

  verificationRequests.length = 0;
  await verifyDomain('get.example.com');
  assert.deepEqual(verificationRequests.map((r) => r.method), ['GET'], 'Verified domains need no mutation.');

  verificationRequests.length = 0;
  verified = false;
  verificationError = true;
  await assert.rejects(verifyDomain('get.example.com'), (error: unknown) =>
    error instanceof VercelApiError && error.status === 400 && error.code === 'verification_failed'
  );
  assert.deepEqual(verificationRequests.map((r) => r.method), ['GET', 'POST']);

  verificationRequests.length = 0;
  missing = true;
  assert.equal((await verifyDomain('get.example.com'))?.configured, false);
  assert.deepEqual(verificationRequests.map((r) => r.method), ['GET'], 'A missing domain must not be attached or verified.');

  verificationRequests.length = 0;
  assert.equal(await verifyDomain('invalid-host'), null);
  delete process.env.VERCEL_API_TOKEN;
  assert.equal(await verifyDomain('get.example.com'), null);
  assert.equal(verificationRequests.length, 0, 'Invalid hosts and missing configuration make no API calls.');

  console.log('Domain lifecycle smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
