import { leadMagnetCreationScope } from '../lib/lead-magnet-creation-limit';
import { assistantProvider, hasAssistantConnection } from '../lib/assistant-provider';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { query } from "../lib/db";
import { campaignDeliveryBody } from "../lib/campaign-email";
import { exampleCampaign } from "../lib/campaign-example";
import { validateCampaignPackage } from "../lib/campaign-schema";
import { renderCampaignPdf, renderCampaignCover } from "../lib/campaign-render";
import { pkceChallenge, tokenHash } from "../lib/assistant-auth";
import {
  authenticateAssistantToken,
  createAssistantGrant,
  exchangeAssistantGrant,
  getCampaign,
  getCampaignForEditing,
  listCampaigns,
  findLeadMagnetForAccount,
  findPublishedLeadMagnetById,
  listLeadMagnetSummaries,
  listCampaignPageLinks,
  listGeneratedHostedResources,
  getPublicCampaign,
  markCampaignPublished,
  registerAssistantClient,
  revokeAssistantGrant,
  saveCampaignCover,
  saveCampaignPackage,
} from "../lib/platform-store";

async function main() {
  assert.equal(assistantProvider('Magnets', 'https://chatgpt.com/connector/oauth/callback'), 'ChatGPT');
  assert.equal(assistantProvider('ChatGPT', 'https://claude.ai/api/mcp/auth_callback'), 'Claude');
  assert.equal(assistantProvider('Magnets', 'https://chatgpt.com.evil.example/callback'), null);
  assert.equal(assistantProvider('Custom client', 'https://example.com/callback'), null);
  assert.equal(assistantProvider('ChatGPT', 'https://example.com/callback'), 'ChatGPT');
  assert.equal(hasAssistantConnection([{ provider: 'ChatGPT' }], 'Claude'), false);
  assert.equal(hasAssistantConnection([{ provider: 'Claude' }], 'Claude'), true);
  assert.equal(hasAssistantConnection([{ provider: null }], 'ChatGPT'), false);

  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(
    url.hostname,
    "127.0.0.1",
    "This smoke test is restricted to the isolated local database.",
  );
  assert.equal(url.port, "55439");
  assert.equal(url.pathname, "/magnets_staging_test");
  const content = validateCampaignPackage(exampleCampaign);
  const linkedContent = { ...content, delivery: { ...content.delivery, body: 'Get the checklist: {resource_url}' } };
  assert.equal(campaignDeliveryBody(linkedContent, 'https://example.com/file'), 'Get the checklist: https://example.com/file');
  assert.match(campaignDeliveryBody(content, 'https://example.com/file'), /https:\/\/example.com\/file/);
  assert.throws(() =>
    validateCampaignPackage({ ...content, title: "A guide — with a dash" }),
  );
  assert.deepEqual(validateCampaignPackage({ ...content, followUps: undefined }).followUps, []);
  assert.throws(() => validateCampaignPackage({ ...content, followUps: Array(4).fill(content.delivery) }));
  const user1 = randomUUID(),
    user2 = randomUUID(),
    account1 = randomUUID(),
    account2 = randomUUID(),
    client = randomUUID();
  await query(
    `insert into neon_auth."user" (id,email,name) values ($1,$2,'Smoke one'),($3,$4,'Smoke two')`,
    [user1, `${user1}@example.invalid`, user2, `${user2}@example.invalid`],
  );
  await query(
    "insert into public.magnets_accounts (id,owner_user_id) values ($1,$2),($3,$4)",
    [account1, user1, account2, user2],
  );
  try {
    await registerAssistantClient(client, "Smoke client", [
      "https://example.com/callback",
    ]);
    const verifier = "a".repeat(64),
      resource = "https://staging.example/mcp";
    await createAssistantGrant({
      accountId: account1,
      clientId: client,
      resource,
      redirectUri: "https://example.com/callback",
      challenge: pkceChallenge(verifier),
      codeHash: tokenHash("first-code"),
    });
    const input = {
      kind: "code" as const,
      hash: tokenHash("first-code"),
      clientId: client,
      resource,
      redirectUri: "https://example.com/callback",
      challenge: pkceChallenge(verifier),
      accessHash: tokenHash("access-1"),
      refreshHash: tokenHash("refresh-1"),
    };
    assert.equal(
      await exchangeAssistantGrant({
        ...input,
        challenge: pkceChallenge("b".repeat(64)),
      }),
      false,
      "Incorrect PKCE cannot exchange code",
    );
    assert.equal(
      await exchangeAssistantGrant({
        ...input,
        resource: "https://other.example/mcp",
      }),
      false,
      "Audience mismatch rejected",
    );
    const raced = await Promise.all([
      exchangeAssistantGrant(input),
      exchangeAssistantGrant(input),
    ]);
    assert.equal(
      raced.filter(Boolean).length,
      1,
      "Code can only be consumed once",
    );
    const grant = await authenticateAssistantToken(
      tokenHash("access-1"),
      resource,
    );
    assert.equal(grant?.account_id, account1);
    assert.equal(
      await authenticateAssistantToken(
        tokenHash("access-1"),
        "https://other.example/mcp",
      ),
      null,
    );
    assert.equal(
      await exchangeAssistantGrant({
        kind: "refresh",
        hash: tokenHash("refresh-1"),
        clientId: client,
        resource,
        accessHash: tokenHash("access-2"),
        refreshHash: tokenHash("refresh-2"),
      }),
      true,
    );
    assert.equal(
      await authenticateAssistantToken(tokenHash("access-1"), resource),
      null,
      "Old access token invalid after rotation",
    );
    assert.equal(
      await exchangeAssistantGrant({
        kind: "refresh",
        hash: tokenHash("refresh-1"),
        clientId: client,
        resource,
        accessHash: tokenHash("access-3"),
        refreshHash: tokenHash("refresh-3"),
      }),
      false,
      "Refresh token replay rejected",
    );
    await revokeAssistantGrant(account2, grant!.id);
    assert.ok(
      await authenticateAssistantToken(tokenHash("access-2"), resource),
      "Other account cannot revoke",
    );
    await revokeAssistantGrant(account1, grant!.id);
    assert.equal(
      await authenticateAssistantToken(tokenHash("access-2"), resource),
      null,
      "Revocation immediate",
    );
    const requestId = randomUUID();
    const saved = await Promise.all([
      saveCampaignPackage(
        account1,
        requestId,
        "pricing",
        content,
        "https://staging.example",
      ),
      saveCampaignPackage(
        account1,
        requestId,
        "pricing",
        content,
        "https://staging.example",
      ),
    ]);
    assert.equal(
      saved[0].id,
      saved[1].id,
      "Concurrent retries create one campaign",
    );
    const campaign = saved[0];
    // Old stored campaigns remain readable without exposing retired promotional copy.
    await query("update magnets_campaigns set content=content || $2::jsonb where id=$1", [campaign.id, JSON.stringify({linkedinPost: 'LEGACY_POST_MUST_NOT_LEAK'})]);
    assert.ok(!JSON.stringify(await getCampaign(account1, campaign.id)).includes('LEGACY_POST_MUST_NOT_LEAK'));
    assert.ok(!JSON.stringify(await listCampaigns(account1)).includes('LEGACY_POST_MUST_NOT_LEAK'));
    assert.ok(!JSON.stringify(await getCampaignForEditing(account1, campaign.id)).includes('LEGACY_POST_MUST_NOT_LEAK'));
    assert.ok(!JSON.stringify(await saveCampaignPackage(account1, requestId, "pricing", content, "https://staging.example")).includes('LEGACY_POST_MUST_NOT_LEAK'));
    assert.equal((await query("select content->>'linkedinPost' as post from magnets_campaigns where id=$1", [campaign.id])).rows[0].post, 'LEGACY_POST_MUST_NOT_LEAK', 'Reads do not rewrite customer records');
    assert.equal(await getCampaign(account2, campaign.id), null);
    assert.deepEqual(await listCampaignPageLinks(account2), [], 'Library campaign links are account scoped');
    assert.deepEqual(await listGeneratedHostedResources(account2), [], 'Generated resources are account scoped');
    const generated = await listGeneratedHostedResources(account1);
    assert.equal(generated.length, 1, 'Creation retries produce one library entry');
    assert.equal(generated[0].id, campaign.id);
    assert.equal(generated[0].leadMagnetId, campaign.lead_magnet_id);
    assert.equal(generated[0].published, false);
    await query("update public.magnets_lead_magnets set title='Renamed in editor',published=true where id=$1", [campaign.lead_magnet_id]);
    const renamed = (await listGeneratedHostedResources(account1))[0];
    assert.equal(renamed.title, 'Renamed in editor', 'Library uses the current lead magnet title');
    assert.equal(renamed.published, true, 'Live link follows current publication state');
    await query('update public.magnets_lead_magnets set published=false where id=$1', [campaign.lead_magnet_id]);
    assert.equal((await listGeneratedHostedResources(account1))[0].published, false, 'Unpublishing removes live link');
    const libraryLinks = await listCampaignPageLinks(account1);
    assert.equal(libraryLinks[0].id, campaign.id);
    assert.equal(libraryLinks[0].usesCampaignCover, false, 'New campaigns do not install placeholder images');
    assert.equal(libraryLinks[0].hasCover, false);
    assert.equal(
      await getPublicCampaign(campaign.public_token),
      null,
      "Draft download is private",
    );
    const magnet = await query(
      "select * from public.magnets_lead_magnets where account_id=$1",
      [account1],
    );
    assert.equal(magnet.rows.length, 1, "Concurrent retries create one magnet");
    assert.ok(
      magnet.rows[0].email_body.includes(
        `/campaign-resources/${campaign.public_token}`,
      ),
      "Delivery contains working resource path",
    );
    assert.equal(magnet.rows[0].follow_up_emails.length, 0);
    assert.equal(magnet.rows[0].follow_up_enabled, false, 'Delivery only by default');
    const requested = { ...content, followUps: [content.delivery] };
    await assert.rejects(saveCampaignPackage(account1, randomUUID(), 'No follow-up request', requested, 'https://staging.example'), /explicitly requests/);
    const optional = await saveCampaignPackage(account1, randomUUID(), 'One follow-up requested', requested, 'https://staging.example', { followUpsRequested: true });
    const optedIn = await query('select follow_up_enabled,follow_up_emails from public.magnets_lead_magnets where id=$1', [optional.lead_magnet_id]);
    assert.equal(optedIn.rows[0].follow_up_enabled, true);
    assert.equal(optedIn.rows[0].follow_up_emails.length, 1);
    assert.equal(optedIn.rows[0].follow_up_emails[0].delayMinutes, 1440);
    assert.equal(magnet.rows[0].published, false);
    assert.equal(magnet.rows[0].image_url, '');
    const legacyCover = `https://staging.example/campaign-covers/${campaign.public_token}`;
    await query('update public.magnets_lead_magnets set image_url=$2,published=true where id=$1', [campaign.lead_magnet_id, legacyCover]);
    assert.equal((await findLeadMagnetForAccount(account1, campaign.lead_magnet_id!))?.imageUrl, '', 'Editor hides the old automatic cover');
    assert.equal((await findPublishedLeadMagnetById(campaign.lead_magnet_id!))?.leadMagnet.imageUrl, '', 'Public pages hide the old automatic cover');
    assert.equal((await listLeadMagnetSummaries(account1)).find(m => m.id === campaign.lead_magnet_id)?.imageUrl, '', 'Library hides the old automatic cover');
    assert.equal((await query('select image_url from public.magnets_lead_magnets where id=$1', [campaign.lead_magnet_id])).rows[0].image_url, legacyCover, 'Read-time filtering leaves stored data intact');
    await query('update public.magnets_lead_magnets set published=false where id=$1', [campaign.lead_magnet_id]);
    await saveCampaignCover(account1, campaign.id, 'real-artwork-bytes');
    assert.equal((await findLeadMagnetForAccount(account1, campaign.lead_magnet_id!))?.imageUrl, legacyCover, 'Uploaded artwork remains visible');
    await query("update public.magnets_campaigns set cover_data='' where id=$1", [campaign.id]);
    await query('update public.magnets_lead_magnets set image_url=$2 where id=$1', [campaign.lead_magnet_id, 'https://example.com/chosen-image.png']);
    assert.equal((await findLeadMagnetForAccount(account1, campaign.lead_magnet_id!))?.imageUrl, 'https://example.com/chosen-image.png', 'Unrelated selected images remain visible');

    assert.equal(await saveCampaignCover(account2, campaign.id, "bad"), false);
    await markCampaignPublished(account1, campaign.id);
    assert.equal(
      await getPublicCampaign(campaign.public_token),
      null,
      "Publication flag alone does not expose draft magnet",
    );
    await query(
      "update public.magnets_lead_magnets set published=true where id=$1",
      [campaign.lead_magnet_id],
    );
    assert.ok(await getPublicCampaign(campaign.public_token));
    await assert.rejects(saveCampaignCover(account1, campaign.id, "bad"), /page is live/);
    await query(
      "update public.magnets_lead_magnets set published=false where id=$1",
      [campaign.lead_magnet_id],
    );
    assert.equal(
      await getPublicCampaign(campaign.public_token),
      null,
      "Unpublishing revokes download",
    );
    await mkdir(".data/qa", { recursive: true });
    const pdf = await renderCampaignPdf(content);
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
    await writeFile(".data/qa/sample-checklist.pdf", pdf);
    await writeFile(
      ".data/qa/sample-cover.png",
      await renderCampaignCover(content),
    );
    console.log(
      "PASS: campaign validation, OAuth PKCE/audience/single-use exchange/rotation/revocation, cross-account isolation, concurrent creation, download revocation, PDF and cover rendering.",
    );
  } finally {
    await query('delete from public.magnets_rate_limits where scope=any($1::text[])', [[account1, account2].map(leadMagnetCreationScope)]);
    await query("delete from public.magnets_assistant_clients where id=$1", [
      client,
    ]);
    await query('delete from neon_auth."user" where id=any($1::uuid[])', [
      [user1, user2],
    ]);
    await globalThis.magnetsPgPool?.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
