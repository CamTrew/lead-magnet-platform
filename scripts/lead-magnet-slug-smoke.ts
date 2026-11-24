import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import { suggestLeadMagnetSlug } from '../lib/lead-magnet-slug';
import { createLeadMagnet, saveCampaignPackage, getCampaignForEditing, updateCampaignCopy } from '../lib/platform-store';
import { exampleCampaign } from '../lib/campaign-example';
import { leadMagnetCreationScope } from '../lib/lead-magnet-creation-limit';

async function main() {
  const db = new URL(process.env.DATABASE_URL || '');
  assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.port, '55439');
  assert.equal(db.pathname, '/magnets_staging_test');
  const title = 'Which AI model should you use? A 10-minute checklist';
  assert.equal(suggestLeadMagnetSlug(title), 'ai-model-checklist');
  assert.equal(suggestLeadMagnetSlug('Café marketing guide'), 'cafe-marketing-guide');
  assert.equal(suggestLeadMagnetSlug('???'), 'resource');
  assert.equal(suggestLeadMagnetSlug('Your '.repeat(40)), 'resource');
  assert.ok(suggestLeadMagnetSlug('x'.repeat(120)).length <= 28);
  const users = [randomUUID(), randomUUID()], accounts = [randomUUID(), randomUUID()];
  try {
    for (let i = 0; i < 2; i++) {
      await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)', [users[i], `${users[i]}@example.invalid`, 'Slug test']);
      await query('insert into public.magnets_accounts (id,owner_user_id) values ($1,$2)', [accounts[i], users[i]]);
    }
    const legacySlug = 'which-ai-model-should-you-use-a-10-minute-checklist';
    const old = await createLeadMagnet(accounts[0], 'Original live page', legacySlug);
    await query('update public.magnets_lead_magnets set published=true where id=$1', [old!.id]);
    const taken = await createLeadMagnet(accounts[0], 'Existing draft', 'ai-model-checklist');
    const content = { ...exampleCampaign, title };
    const requestId = randomUUID();
    const [first, same] = await Promise.all([
      saveCampaignPackage(accounts[0], requestId, title, content, 'https://staging.example'),
      saveCampaignPackage(accounts[0], requestId, title, content, 'https://staging.example'),
    ]);
    assert.equal(first.id, same.id, 'Concurrent request retries stay idempotent');
    const created = await query('select slug from public.magnets_lead_magnets where id=$1', [first.lead_magnet_id]);
    assert.equal(created.rows[0].slug, 'ai-model-checklist-2', 'An unpublished draft reserves its URL too');
    await Promise.all([
      createLeadMagnet(accounts[0], 'Manual collision', 'ai-model-checklist'),
      saveCampaignPackage(accounts[0], randomUUID(), title, content, 'https://staging.example'),
      saveCampaignPackage(accounts[0], randomUUID(), title, content, 'https://staging.example'),
    ]);
    const short = (await query('select slug from public.magnets_lead_magnets where account_id=$1 and slug like $2 order by slug', [accounts[0], 'ai-model-checklist%'])).rows.map(row => row.slug);
    assert.deepEqual(short, ['ai-model-checklist', 'ai-model-checklist-2', 'ai-model-checklist-3', 'ai-model-checklist-4', 'ai-model-checklist-5']);
    await assert.rejects(query('insert into public.magnets_lead_magnets (account_id,title,slug) values ($1,$2,$3)', [accounts[0], 'Collision', 'ai-model-checklist']), (error: unknown) => (error as {code:string}).code === '23505');
    assert.equal((await query('select title from public.magnets_lead_magnets where id=$1', [taken!.id])).rows[0].title, 'Existing draft');
    const editable = await getCampaignForEditing(accounts[0], first.id);
    await updateCampaignCopy(accounts[0], first.id, editable!.editVersion, {title:'A new campaign title'});
    assert.equal((await query('select slug from public.magnets_lead_magnets where id=$1', [first.lead_magnet_id])).rows[0].slug, 'ai-model-checklist-2', 'Title edits do not change URLs');
    assert.equal((await query('select slug from public.magnets_lead_magnets where id=$1', [old!.id])).rows[0].slug, legacySlug, 'Old public URLs remain unchanged');
    const custom = await createLeadMagnet(accounts[0], title, 'my-chosen-url-is-kept-as-entered');
    assert.equal(custom!.slug, 'my-chosen-url-is-kept-as-entered');
    const other = await createLeadMagnet(accounts[1], title, 'ai-model-checklist');
    assert.equal(other!.slug, 'ai-model-checklist', 'Different accounts can use the same slug');
    console.log('PASS: short suggestions, legacy URLs, explicit slugs, draft collisions, concurrent manual/MCP creation, retries, database uniqueness, title edits and account isolation.');
  } finally {
    await query('delete from public.magnets_rate_limits where scope=any($1::text[])', [accounts.map(leadMagnetCreationScope)]);
    await query('delete from neon_auth."user" where id=any($1::uuid[])', [users]);
    await globalThis.magnetsPgPool?.end();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
