import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { withAdvisoryLock, withTransaction } from '../lib/db';
import { leadMagnetSaveRetryDelay, requestLeadMagnetSave, RetryableLeadMagnetSaveError } from '../lib/lead-magnet-save';

async function testSaveRetries() {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const requests: string[] = [];
  let draft = { title: 'First edit', saveSource: 'autosave' };
  try {
    // More than the previous three retries must still recover automatically.
    globalThis.fetch = async (_input, init) => {
      requests.push(String(init?.body));
      return requests.length <= 7
        ? Response.json({ code: 'save_in_progress' }, { status: 409 })
        : Response.json({ leadMagnet: JSON.parse(String(init?.body)) });
    };
    const delays: number[] = [];
    for (let attempt = 0; ; attempt += 1) {
      try {
        const saved = await requestLeadMagnetSave('test-magnet', JSON.stringify(draft));
        assert.equal(saved.data?.leadMagnet?.title, 'Newest edit');
        break;
      } catch (error) {
        assert.ok(error instanceof RetryableLeadMagnetSaveError);
        delays.push(leadMagnetSaveRetryDelay(attempt, error.retryAfterMs));
        draft = { ...draft, title: 'Newest edit' };
      }
    }
    assert.equal(requests.length, 8);
    assert.equal(JSON.parse(requests[0]).title, 'First edit');
    assert.ok(requests.slice(1).every((body) => JSON.parse(body).title === 'Newest edit'));
    assert.deepEqual(delays, [2000, 4000, 8000, 16000, 30000, 30000, 30000]);

    for (const status of [400, 401, 403, 404, 409, 413]) {
      globalThis.fetch = async () => Response.json({ error: 'Needs correction' }, { status });
      const result = await requestLeadMagnetSave('test-magnet', JSON.stringify(draft));
      assert.equal(result.response.status, status, 'Permanent errors need correction, not endless retries');
      assert.equal(result.data?.error, 'Needs correction');
    }
    for (const status of [429, 500, 502, 503, 504]) {
      globalThis.fetch = async () => Response.json({ error: 'Temporarily unavailable' }, {
        status, headers: { 'Retry-After': '60' },
      });
      await assert.rejects(() => requestLeadMagnetSave('test-magnet', JSON.stringify(draft)),
        (error: unknown) => error instanceof RetryableLeadMagnetSaveError
          && leadMagnetSaveRetryDelay(0, error.retryAfterMs) === 60_000);
    }
    globalThis.fetch = async () => Response.json({
      error: 'This page is already being saved. Wait a moment and try again.',
    }, { status: 409 });
    await assert.rejects(() => requestLeadMagnetSave('test-magnet', JSON.stringify(draft)), RetryableLeadMagnetSaveError);

    globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
    await assert.rejects(() => requestLeadMagnetSave('test-magnet', JSON.stringify(draft)), RetryableLeadMagnetSaveError);
    globalThis.fetch = async () => new Response('incomplete response', { status: 200 });
    await assert.rejects(() => requestLeadMagnetSave('test-magnet', JSON.stringify(draft)), RetryableLeadMagnetSaveError);

    let expire!: () => void;
    globalThis.setTimeout = ((callback: () => void) => {
      expire = callback;
      return 0;
    }) as unknown as typeof setTimeout;
    globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Timed out')));
    });
    const stalled = requestLeadMagnetSave('test-magnet', JSON.stringify(draft));
    expire();
    await assert.rejects(() => stalled, RetryableLeadMagnetSaveError);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

async function testBrokenRollback() {
  const previousPool = globalThis.magnetsPgPool;
  let discarded: boolean | undefined;
  globalThis.magnetsPgPool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (sql === 'rollback') throw new Error('Connection lost during rollback');
        return { rows: [] };
      },
      release: (destroy: boolean) => { discarded = destroy; },
    }),
  } as unknown as Pool;
  try {
    await assert.rejects(() => withTransaction(async () => {
      throw new Error('Save failed');
    }), /Save failed/);
    assert.equal(discarded, true, 'Never pool a connection that may still own transaction locks');
  } finally {
    globalThis.magnetsPgPool = previousPool;
  }
}

async function testPooledLock() {
  const key = `magnets:editor-save-smoke:${randomUUID()}`;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const owner = withAdvisoryLock(key, async (client) => {
    const before = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
    enter();
    await held;
    const after = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
    assert.equal(after.rows[0].pid, before.rows[0].pid, 'The pooler must retain the lock-owning backend');
    return 'saved';
  });
  try {
    await Promise.race([entered, owner]);
    const competing = await withAdvisoryLock(key, async () => {
      assert.fail('A concurrent save must not enter the locked section');
    });
    assert.equal(competing.acquired, false);
    const differentPage = await withAdvisoryLock(`${key}:other-page`, async () => 'independent');
    assert.equal(differentPage.value, 'independent');
  } finally {
    release();
    await owner;
  }
  assert.equal((await owner).value, 'saved');
  assert.equal((await withAdvisoryLock(key, async () => 'next save')).value, 'next save');
  await assert.rejects(() => withAdvisoryLock(key, async () => {
    throw new Error('Provider sync failed');
  }), /Provider sync failed/);
  assert.equal((await withAdvisoryLock(key, async () => 'recovered')).value, 'recovered');
}

async function main() {
  await testSaveRetries();
  await testBrokenRollback();
  await testPooledLock();
  console.log('Editor save smoke passed: automatic recovery with latest edits, capped backoff, pooled mutual exclusion, and lock release after success/failure.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await globalThis.magnetsPgPool?.end();
});
