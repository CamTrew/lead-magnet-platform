import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import { completeOnboarding, getAccountPlatformUsername } from '../lib/platform-store';
import { isValidNewPlatformUsername, PlatformUsernameUnavailableError, suggestedPlatformUsername, platformLeadMagnetPath } from '../lib/platform-username';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55439'); assert.equal(url.pathname, '/magnets_staging_test');
  for (const value of ['api', 'create', 'resources', 'oauth', 'preview', 'ab', 'a/b', '-name', 'name-', 'a'.repeat(41)]) assert.equal(isValidNewPlatformUsername(value), false, value);
  assert.equal(isValidNewPlatformUsername('cameron-trew'), true);
  assert.equal(suggestedPlatformUsername('Cameron Trew'), 'cameron-trew');
  assert.equal(suggestedPlatformUsername('Resources'), 'resources-creator');
  assert.equal(platformLeadMagnetPath('cameron-trew','my-guide','id'), '/cameron-trew/my-guide');
  assert.equal(platformLeadMagnetPath('','my-guide','id'), '/p/id');
  const users = [randomUUID(),randomUUID()]; const accounts = [randomUUID(),randomUUID()];
  const name = `claimed-${randomUUID().slice(0,8)}`;
  const answers = { businessName: 'Creator test', businessType: '', magnetType: '', cadence: '' };
  try {
    for (let i=0;i<2;i++) {
      await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)', [users[i],`${users[i]}@example.invalid`,'Creator test']);
      await query("insert into magnets_accounts (id,owner_user_id,domain,subdomain,domain_attached_host,brand) values ($1,$2,$4,'get',$5,$3::jsonb)", [accounts[i],users[i],JSON.stringify({primary:'#123456'}),`${accounts[i]}.example.com`,`get.${accounts[i]}.example.com`]);
    }
    const results = await Promise.allSettled(accounts.map(account => completeOnboarding(account,{...answers,username:name.toUpperCase()})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one account claims a name');
    const failed = results.find(r=>r.status==='rejected'); assert.ok(failed?.status==='rejected' && failed.reason instanceof PlatformUsernameUnavailableError);
    const winner = results.findIndex(r=>r.status==='fulfilled'); const loser=1-winner;
    assert.equal(await getAccountPlatformUsername(accounts[winner]),name);
    const unclaimed = (await query('select username,onboarding_completed_at from magnets_accounts where id=$1',[accounts[loser]])).rows[0];
    assert.equal(unclaimed.username,''); assert.equal(unclaimed.onboarding_completed_at,null,'Unavailable name cannot complete onboarding');
    assert.equal((await completeOnboarding(accounts[winner],{...answers,username:name}))?.username,name,'Same choice is retry safe');
    await assert.rejects(completeOnboarding(accounts[winner],{...answers,username:'do-not-rename'}),PlatformUsernameUnavailableError);
    assert.equal((await completeOnboarding(accounts[winner],{...answers,businessName:'Different brand'}))?.username,name,'Legacy onboarding preserves a claimed URL');
    const preserved = (await query('select domain,domain_attached_host,brand from magnets_accounts where id=$1',[accounts[winner]])).rows[0];
    assert.equal(preserved.domain,`${accounts[winner]}.example.com`); assert.equal(preserved.domain_attached_host,`get.${accounts[winner]}.example.com`); assert.equal(preserved.brand.primary,'#123456');
    await assert.rejects(completeOnboarding(accounts[loser],{...answers,username:''}));
    assert.equal((await completeOnboarding(accounts[loser],{...answers,username:`${name}-other`}))?.username,`${name}-other`);
    console.log('PASS: explicit URL claims, collision races, validation, reserved routes, retries, existing URL/domain/brand preservation and platform link formatting.');
  } finally {
    await query('delete from neon_auth."user" where id=any($1::uuid[])',[users]);
    await globalThis.magnetsPgPool?.end();
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
