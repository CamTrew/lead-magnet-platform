import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import { decodeAssistantFile, uploadAssistantResource } from '../lib/assistant-resource-upload';
import { exampleCampaign } from '../lib/campaign-example';
import { validateCampaignPackage } from '../lib/campaign-schema';
import { getCampaignForEditing, resolveCampaignHostedResource, saveCampaignPackage, updateCampaignCopy } from '../lib/platform-store';
import { renderCampaignPdf } from '../lib/campaign-render';
import { publishCampaign } from '../lib/campaign-service';
import { leadMagnetCreationScope } from '../lib/lead-magnet-creation-limit';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55439'); assert.equal(url.pathname, '/magnets_staging_test');
  process.env.MAGNETS_ASSISTANT_ORIGIN = 'http://127.0.0.1:3108';
  process.env.HOSTED_RESOURCES_BLOB_STORE_ID = 'test-private';
  process.env.HOSTED_RESOURCES_READ_WRITE_TOKEN = 'test-only';
  const bytes = Buffer.from('Original content, including punctuation.\n');
  assert.deepEqual(decodeAssistantFile('guide.txt', bytes.toString('base64')).bytes, bytes);
  assert.throws(() => decodeAssistantFile('guide.pdf', bytes.toString('base64')), /do not match/);
  assert.throws(() => decodeAssistantFile('guide.txt', '%%%'), /base64/);
  assert.throws(() => decodeAssistantFile('guide.txt', ''), /base64/);
  assert.throws(() => decodeAssistantFile('guide.exe', bytes.toString('base64')), /Upload a PDF/);
  assert.throws(() => decodeAssistantFile('guide.txt', Buffer.alloc(1024*1024+1, 65).toString('base64')), /over 1 MB/);
  const users = [randomUUID(), randomUUID()], accounts = [randomUUID(), randomUUID()];
  for (let i=0;i<2;i++) {
    await query('insert into neon_auth."user" (id,email,name) values ($1,$2,$3)', [users[i], `${users[i]}@example.invalid`, 'File smoke']);
    await query('insert into public.magnets_accounts (id,owner_user_id) values ($1,$2)', [accounts[i],users[i]]);
  }
  let uploads = 0, deletes = 0;
  const storage: NonNullable<Parameters<typeof uploadAssistantResource>[3]> = {
    put: async (pathname, body, options) => {
      uploads++; assert.deepEqual(body, bytes); assert.equal(options.access, 'private'); assert.equal(options.storeId, 'test-private');
      return { url:`https://test.private.blob.vercel-storage.com/${pathname}`, downloadUrl:'', pathname, contentType:'text/plain',contentDisposition:'attachment',etag:'test' };
    },
    del: async () => { deletes++; },
  };
  try {
    const file = await uploadAssistantResource(accounts[0], 'guide.txt', bytes.toString('base64'), storage);
    assert.equal('blobUrl' in file, false);
    assert.equal((await uploadAssistantResource(accounts[0], 'guide.txt', bytes.toString('base64'), storage)).id, file.id);
    assert.equal(uploads, 1, 'Retry reuses original upload');
    assert.equal((await resolveCampaignHostedResource(accounts[0], `http://127.0.0.1:3108${file.publicUrl}`)).id, file.id);
    await assert.rejects(resolveCampaignHostedResource(accounts[1], file.id), /not found/);
    await assert.rejects(resolveCampaignHostedResource(accounts[1], `http://127.0.0.1:3108${file.publicUrl}`), /not found/);
    await assert.rejects(resolveCampaignHostedResource(accounts[0], `https://evil.example${file.publicUrl}`), /Magnets link/);
    const content = validateCampaignPackage({...exampleCampaign, resource:{hostedResource:`http://127.0.0.1:3108${file.publicUrl}`}});
    const request = randomUUID();
    await assert.rejects(saveCampaignPackage(accounts[1], request, 'Use this file', content, 'http://127.0.0.1:3108'), /not found/);
    const campaign = await saveCampaignPackage(accounts[0], request, 'Use this file', content, 'http://127.0.0.1:3108');
    assert.deepEqual(campaign.content.resource, {hostedResource:file.id});
    assert.equal((await saveCampaignPackage(accounts[0], request, 'Retry', content, 'http://127.0.0.1:3108')).id, campaign.id);
    const edit = (await getCampaignForEditing(accounts[0],campaign.id))!;
    assert.equal(edit.magnet.downloadLink, `http://127.0.0.1:3108${file.publicUrl}`);
    assert.ok(edit.magnet.emailBody.includes(file.publicUrl));
    await assert.rejects(updateCampaignCopy(accounts[0], campaign.id, edit.editVersion, {resource:exampleCampaign.resource}), /original file is preserved/);
    const changed = await updateCampaignCopy(accounts[0], campaign.id, edit.editVersion, {delivery:{body:'Hi {name},\n\n[Get your file]({resource_url})'}});
    assert.equal(changed.magnet.downloadLink, edit.magnet.downloadLink);
    assert.ok(changed.magnet.emailBody.includes(file.publicUrl));
    await assert.rejects(renderCampaignPdf(campaign.content), /original uploaded file/);
    await query('delete from public.magnets_hosted_resources where id=$1', [file.id]);
    await assert.rejects(saveCampaignPackage(accounts[0], randomUUID(), 'Deleted file', content, 'http://127.0.0.1:3108'), /not found/);
    await assert.rejects(publishCampaign(accounts[0], campaign.id), /not found/);
    // Metadata failure cleans up the private upload, rather than retaining an orphan.
    await assert.rejects(uploadAssistantResource(randomUUID(), 'guide.txt', bytes.toString('base64'), storage));
    assert.equal(deletes, 1);
    console.log('PASS: exact bytes, validation, private storage, retry deduplication, account isolation, original-file campaign links, copy preservation, missing-file rejection and orphan cleanup. Blob network calls mocked; database isolated locally.');
  } finally {
    await query('delete from public.magnets_rate_limits where scope=any($1::text[])', [accounts.map(leadMagnetCreationScope)]);
    await query('delete from neon_auth."user" where id=any($1::uuid[])', [users]);
    await globalThis.magnetsPgPool?.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
