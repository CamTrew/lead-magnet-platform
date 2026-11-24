import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import { exampleCampaign } from '../lib/campaign-example';
import { createLeadMagnet, saveCampaignPackage, deleteLeadMagnet, getCampaignForEditing, updateCampaignCopy } from '../lib/platform-store';
import { LeadMagnetCreationLimitError, leadMagnetCreationScope } from '../lib/lead-magnet-creation-limit';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55439');
  assert.equal(url.pathname, '/magnets_staging_test');
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const accounts = [randomUUID(), randomUUID(), randomUUID()];
  try {
    for (let i = 0; i < users.length; i++) {
      await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)', [users[i], `${users[i]}@example.invalid`, 'Quota test']);
      await query('insert into public.magnets_accounts (id,owner_user_id) values ($1,$2)', [accounts[i], users[i]]);
    }
    const requestIds = Array.from({ length: 12 }, () => randomUUID());
    const results = await Promise.allSettled(requestIds.map((id, index) => index % 2
      ? createLeadMagnet(accounts[0], `Manual ${index}`, `manual-${index}`)
      : saveCampaignPackage(accounts[0], id, 'Quota test', exampleCampaign, 'https://staging.example')));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10, 'Concurrent manual and assistant creations share ten slots');
    for (const result of results.filter((r) => r.status === 'rejected')) {
      assert.ok(result.reason instanceof LeadMagnetCreationLimitError);
      assert.ok(result.reason.retryAfterSeconds > 86000 && result.reason.retryAfterSeconds <= 86400);
    }
    const count = async (account: string) => Number((await query('select count(*) from public.magnets_lead_magnets where account_id=$1', [account])).rows[0].count);
    assert.equal(await count(accounts[0]), 10);
    const campaign = (await query('select id,request_id,lead_magnet_id from public.magnets_campaigns where account_id=$1 limit 1', [accounts[0]])).rows[0];
    assert.equal((await saveCampaignPackage(accounts[0], campaign.request_id, 'Retry', exampleCampaign, 'https://staging.example')).id, campaign.id, 'Retry succeeds at quota without consuming a slot');
    const editable = await getCampaignForEditing(accounts[0], campaign.id);
    await updateCampaignCopy(accounts[0], campaign.id, editable!.editVersion, { title: 'Edits still work at quota' });
    const manual = (await query('select id from public.magnets_lead_magnets where account_id=$1 and id<>$2 limit 1', [accounts[0], campaign.lead_magnet_id])).rows[0];
    await deleteLeadMagnet(accounts[0], manual.id);
    await assert.rejects(createLeadMagnet(accounts[0], 'Delete bypass', 'delete-bypass'), LeadMagnetCreationLimitError);
    assert.equal(await count(accounts[0]), 9);
    // Only one slot expires; the whole allowance must not reset together.
    await query("update public.magnets_rate_limits set window_start=now()-interval '25 hours' where scope=$1 and identifier_hash=md5($2::text)", [leadMagnetCreationScope(accounts[0]), manual.id]);
    await createLeadMagnet(accounts[0], 'One expired slot', 'expired-slot');
    await assert.rejects(createLeadMagnet(accounts[0], 'Still full', 'still-full'), LeadMagnetCreationLimitError);
    // Pre-existing magnets are counted, even if one is deleted before first creation under this policy.
    for (let i = 0; i < 10; i++) await query('insert into public.magnets_lead_magnets (account_id,title,slug) values ($1,$2,$3)', [accounts[1], `Existing ${i}`, `existing-${i}`]);
    const old = (await query('select id from public.magnets_lead_magnets where account_id=$1 limit 1', [accounts[1]])).rows[0];
    await deleteLeadMagnet(accounts[1], old.id);
    await assert.rejects(createLeadMagnet(accounts[1], 'Existing account', 'existing-account'), LeadMagnetCreationLimitError);
    // Distinct accounts have distinct allowances. Failures after inserting a magnet roll back the ledger too.
    await createLeadMagnet(accounts[2], 'Separate allowance', 'separate');
    const broken = { ...exampleCampaign, toJSON() { throw new Error('Simulated serialization failure'); } };
    await assert.rejects(saveCampaignPackage(accounts[2], randomUUID(), 'Failure', broken, 'https://staging.example'), /Simulated serialization failure/);
    assert.equal(await count(accounts[2]), 1);
    assert.equal(Number((await query('select count(*) from public.magnets_rate_limits where scope=$1', [leadMagnetCreationScope(accounts[2])])).rows[0].count), 1);
    console.log('PASS: shared rolling 10/24h quota, concurrency, account isolation, retry idempotency, editing, deletion resistance, expiry, existing creations and transaction rollback.');
  } finally {
    await query('delete from public.magnets_rate_limits where scope=any($1::text[])', [accounts.map(leadMagnetCreationScope)]);
    await query('delete from neon_auth."user" where id=any($1::uuid[])', [users]);
    await globalThis.magnetsPgPool?.end();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
