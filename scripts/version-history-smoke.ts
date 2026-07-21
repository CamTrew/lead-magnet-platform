import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import {
  findLeadMagnetForAccount,
  getLeadMagnetVersion,
  listLeadMagnetVersions,
  updateLeadMagnet,
} from '../lib/platform-store';

const accountId = randomUUID();
const magnetId = randomUUID();
const userId = randomUUID();

async function main() {
 try {
  await query(
    `insert into neon_auth."user" (id, name, email, "emailVerified") values ($1, 'Version smoke', $2, true)`,
    [userId, `version-smoke-${userId}@example.com`]
  );
  await query(
    `insert into public.magnets_accounts (id, owner_user_id) values ($1, $2)`,
    [accountId, userId]
  );
  await query(
    `
      insert into public.magnets_lead_magnets (
        id,
        account_id,
        slug,
        title,
        email_subject,
        email_body
      ) values ($1, $2, 'version-smoke', 'Original title', 'Original subject', 'Original body')
    `,
    [magnetId, accountId]
  );

  const original = await findLeadMagnetForAccount(accountId, magnetId);
  assert.ok(original);
  const changed = await updateLeadMagnet(
    accountId,
    magnetId,
    { ...original, title: 'Changed title' },
    { versionSource: 'manual' }
  );
  assert.equal(changed?.title, 'Changed title');

  let versions = await listLeadMagnetVersions(accountId, magnetId);
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.source, 'manual');
  assert.equal(versions[1]?.source, 'baseline');

  // Version history must stay scoped to the owning account. Knowing both IDs
  // is not enough to read another customer's content.
  const unrelatedAccountId = randomUUID();
  assert.deepEqual(await listLeadMagnetVersions(unrelatedAccountId, magnetId), []);
  assert.equal(
    await getLeadMagnetVersion(unrelatedAccountId, magnetId, versions[0].id),
    null
  );

  const baseline = await getLeadMagnetVersion(accountId, magnetId, versions[1].id);
  assert.equal(baseline?.title, 'Original title');

  // Identical consecutive autosaves should not flood the recovery list.
  const current = await findLeadMagnetForAccount(accountId, magnetId);
  assert.ok(current);
  await updateLeadMagnet(
    accountId,
    magnetId,
    current,
    { versionSource: 'autosave' }
  );
  versions = await listLeadMagnetVersions(accountId, magnetId);
  assert.equal(versions.length, 2);

  // Restoring an older state after an edit must itself become recoverable.
  assert.ok(baseline);
  await updateLeadMagnet(
    accountId,
    magnetId,
    { ...current, ...baseline },
    { versionSource: 'restore' }
  );
  versions = await listLeadMagnetVersions(accountId, magnetId);
  assert.equal(versions.length, 3);
  assert.equal(versions[0]?.source, 'restore');
  assert.equal((await findLeadMagnetForAccount(accountId, magnetId))?.title, 'Original title');

  console.log('Lead magnet version history smoke tests passed.');
  } finally {
    await query(`delete from public.magnets_accounts where id = $1`, [accountId]);
    await query(`delete from neon_auth."user" where id = $1`, [userId]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
