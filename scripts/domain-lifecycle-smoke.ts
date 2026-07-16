import assert from 'node:assert/strict';
import { syncProjectDomain } from '../lib/vercel';

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

  console.log('Domain lifecycle smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
