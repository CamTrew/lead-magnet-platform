import { leadMagnetCreationScope } from '../lib/lead-magnet-creation-limit';
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { query } from "../lib/db";
import { recordSubmission, listAccountSignups, createHostedResource, saveCreationRequest, getCreationRequest, getCreationBrand, createDatabaseSession } from "../lib/platform-store";
import { pkceChallenge } from "../lib/assistant-auth";
import { campaignNextStep, CAMPAIGN_COMPLETION_GUIDANCE } from "../lib/campaign-content";
import { exampleCampaign } from "../lib/campaign-example";

async function main() {
  const db = new URL(process.env.DATABASE_URL || "");
  assert.equal(db.hostname, "127.0.0.1");
  assert.equal(db.port, "55439");
  assert.equal(db.pathname, "/magnets_staging_test");
  const base = "http://127.0.0.1:" + (process.env.MCP_TEST_PORT || "3108");
  const unauthorized = await fetch(`${base}/mcp`, { method: "POST" });
  assert.equal(unauthorized.status, 401);
  assert.match(
    unauthorized.headers.get("www-authenticate") || "",
    /resource_metadata/,
  );
  const metadata = await (
    await fetch(`${base}/.well-known/oauth-authorization-server`)
  ).json();
  assert.equal(metadata.issuer, base);
  const registration = await fetch(`${base}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Local HTTP smoke",
      redirect_uris: ["https://example.com/callback"],
    }),
  });
  assert.equal(registration.status, 201);
  const { client_id } = await registration.json();
  const user = randomUUID(),
    account = randomUUID(),
    verifier = "v".repeat(64);
  await query(
    `insert into neon_auth."user" (id,email,name) values ($1,$2,'HTTP smoke')`,
    [user, `${user}@example.invalid`],
  );
  await query(
    "insert into public.magnets_accounts (id,owner_user_id) values ($1,$2)",
    [account, user],
  );
  const client = new Client({ name: "Magnets smoke", version: "1.0.0" });
  try {
    const session = await createDatabaseSession(user);
    const consentFields = {
      client_id, redirect_uri: 'https://example.com/callback', response_type: 'code',
      code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256',
      state: randomUUID(), resource: `${base}/mcp`, scope: 'campaigns:create',
    };
    const consentPath = `/oauth/authorize?${new URLSearchParams(consentFields)}`;
    const anonymousConsent = await fetch(base + consentPath, { redirect: 'manual' });
    // Next can stream a redirect as a refresh tag after response headers are sent.
    if (anonymousConsent.status === 307) {
      assert.match(anonymousConsent.headers.get('location') || '', /login\?next=/);
    } else {
      assert.equal(anonymousConsent.status, 200);
      assert.match(await anonymousConsent.text(), /http-equiv="refresh"[^>]*\/login\?next=/);
    }
    const consentPage = await fetch(base + consentPath, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(consentPage.status, 200);
    assert.match(await consentPage.text(), /Connect to my Magnets account/);
    const confirm = (origin: string, fields = consentFields) => fetch(`${base}/oauth/authorize/confirm`, {
      method: 'POST', redirect: 'manual',
      headers: { origin, cookie: `magnets_session=${session}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
    assert.equal((await confirm('https://untrusted.example')).status, 403, 'Cross-origin consent is blocked');
    assert.equal((await confirm(base, { ...consentFields, redirect_uri: 'https://untrusted.example/callback' })).status, 400, 'Unregistered redirects are blocked');
    const approved = await confirm(base);
    assert.equal(approved.status, 303);
    const callback = new URL(approved.headers.get('location')!);
    assert.equal(callback.origin, 'https://example.com');
    assert.equal(callback.searchParams.get('state'), consentFields.state);
    assert.equal(callback.searchParams.get('iss'), base);
    const code = callback.searchParams.get('code')!;
    assert.ok(code);
    const pendingConnections = await fetch(`${base}/api/assistant-connections`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal((await pendingConnections.json()).connections.length, 0, 'Consent alone is not a completed connection');
    const fields = {
      grant_type: "authorization_code",
      client_id,
      resource: `${base}/mcp`,
      redirect_uri: "https://example.com/callback",
      code,
      code_verifier: verifier,
    };
    const token = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    assert.equal(token.status, 200);
    const { access_token, refresh_token } = await token.json();
    const connectionsResponse = await fetch(`${base}/api/assistant-connections`, { headers: { cookie: `magnets_session=${session}` } });
    const { connections } = await connectionsResponse.json();
    assert.equal(connections.length, 1, 'Token exchange completes the connection');
    assert.equal(
      (
        await fetch(`${base}/oauth/token`, {
          method: "POST",
          body: new URLSearchParams(fields),
        })
      ).status,
      400,
      "Consumed code rejected over HTTP",
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${access_token}` } },
      }),
    );
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 10);
    const brief = await saveCreationRequest(account, 'A pricing checklist for freelance designers', 'checklist');
    const repeatedBrief = await saveCreationRequest(account, brief.brief, brief.format);
    assert.equal(repeatedBrief.request_id, brief.request_id, 'Repeated brief keeps request key');
    assert.equal(await getCreationRequest(randomUUID()), null, 'Brief cannot cross account boundary');
    await query(`update public.magnets_accounts set logo_text='Acme Studio', logo_url='data:image/png;base64,private-test-bytes',
      brand=$2::jsonb where id=$1`, [account, JSON.stringify({ primary: '#123456', accent: '#abcdef', pageTheme: 'dark' })]);
    assert.equal(await getCreationBrand(randomUUID()), null, 'Brand cannot cross account boundary');
    const guide = await client.callTool({
      name: "get_creation_guide",
      arguments: {},
    });
    assert.ok(!guide.isError);
    const sourceChoice = (guide.structuredContent as { resourceChoice: { askBeforeGenerating: boolean; skipIfAlreadyAnswered: boolean; options: Array<{value: string}> } }).resourceChoice;
    assert.equal(sourceChoice.askBeforeGenerating, true);
    assert.equal(sourceChoice.skipIfAlreadyAnswered, true);
    assert.deepEqual(sourceChoice.options.map(option => option.value), ['existing', 'create_together']);
    assert.equal((guide.structuredContent as { savedBrief: { request_id: string } }).savedBrief.request_id, brief.request_id);
    const returnedBrand = (guide.structuredContent as { brand: Record<string, unknown> }).brand;
    assert.deepEqual(returnedBrand, { name: 'Acme Studio', primary: '#123456', accent: '#abcdef', pageTheme: 'dark', hasLogo: true });
    assert.ok(!JSON.stringify(guide).includes('private-test-bytes'), 'Inline logos must not enter assistant context');
    assert.ok(!Object.keys(returnedBrand).includes('resendApiKey'));
    const savedIdea = await fetch(`${base}/api/campaigns/brief`, { method: 'POST', headers: { cookie: `magnets_session=${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.brief, format: brief.format }) });
    assert.equal(savedIdea.status, 200);
    const beforeClaim = (await query('select username,onboarding_completed_at from public.magnets_accounts where id=$1', [account])).rows[0];
    assert.equal(beforeClaim.username, '', 'Saving an idea does not choose a URL silently');
    assert.equal(beforeClaim.onboarding_completed_at, null, 'Onboarding waits for a URL choice');
    const restored = await fetch(`${base}/api/campaigns/brief`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(restored.status, 200);
    const restoredBody = await restored.json();
    assert.equal(restoredBody.savedBrief.request_id, brief.request_id);
    assert.equal(restoredBody.brand.logoText, 'Acme Studio');
    assert.equal((await fetch(`${base}/api/campaigns/brief`)).status, 401);
    const workspace = await fetch(`${base}/create`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(workspace.status, 200);
    assert.ok((await workspace.text()).includes("Make it look like you."), "Saved idea resumes at brand review before connecting an assistant");
    const requestId = brief.request_id;
    const logoBytes = await sharp({ create: { width: 64, height: 40, channels: 4, background: '#123456' } }).png().toBuffer();
    await query('update public.magnets_accounts set logo_url=$2 where id=$1', [account, `data:image/png;base64,${logoBytes.toString('base64')}`]);
    const saved = await client.callTool({
      name: "save_campaign",
      arguments: {
        requestId,
        brief: "Freelance pricing checklist",
        campaign: exampleCampaign,
      },
    });
    assert.ok(!saved.isError, JSON.stringify(saved));
    const content = saved.structuredContent as {
      campaignId: string;
      reviewUrl: string;
      status: string;
      editorUrl: string;
      audienceUrl: string;
      publicUrl: string | null;
    };
    const freshIdea = await fetch(`${base}/create?new=1`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(freshIdea.status, 200);
    assert.match(await freshIdea.text(), /What’s your idea/);
    assert.equal(content.status, "draft");
    assert.match((saved.structuredContent as { publicationError: string }).publicationError, /username/);
    assert.ok(content.reviewUrl.startsWith(base));
    assert.equal(content.publicUrl, null, 'Draft must not be presented as live');
    assert.ok(content.editorUrl.startsWith(`${base}/dashboard/pages/`));
    assert.equal(content.audienceUrl, `${base}/dashboard/signups`);
    const imageBytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#668855' } }).png().toBuffer();
    type ImageBrief = { brandVersion: string; prompt: string; brand: { name: string; primary: string; accent: string; pageTheme: string; logoReference: { kind: string } } };
    const savedImage = (saved.structuredContent as { imageGeneration: ImageBrief }).imageGeneration;
    assert.equal(savedImage.brand.primary, '#123456');
    assert.equal(savedImage.brand.logoReference.kind, 'attached-image');
    assert.ok((saved.content as Array<{ type: string }>).some(block => block.type === 'image'), 'The real saved logo is supplied as an image reference');
    assert.ok(!JSON.stringify(saved.structuredContent).includes(logoBytes.toString('base64')), 'Logo bytes stay out of text/prompt fields');
    assert.ok(savedImage.prompt.includes('Acme Studio') && savedImage.prompt.includes('#abcdef'));
    assert.ok(!JSON.stringify(saved.structuredContent).includes('resendApiKey'));
    const newLogo = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#654321' } }).png().toBuffer();
    await query(`update public.magnets_accounts set logo_text='Updated Studio', logo_url=$2, brand=$3::jsonb where id=$1`,
      [account, `data:image/png;base64,${newLogo.toString('base64')}`, JSON.stringify({ primary: '#654321', accent: '#fedcba', pageTheme: 'light' })]);
    const refreshedImageReply = await client.callTool({ name: 'get_campaign', arguments: { campaignId: content.campaignId } });
    const refreshedImage = (refreshedImageReply.structuredContent as { imageGeneration: ImageBrief }).imageGeneration;
    assert.deepEqual(refreshedImage.brand, { name: 'Updated Studio', primary: '#654321', accent: '#fedcba', pageTheme: 'light', logoReference: { kind: 'attached-image' } });
    assert.notEqual(refreshedImage.brandVersion, savedImage.brandVersion);
    const reference = (refreshedImageReply.content as Array<{ type: string; data?: string }>).find(block => block.type === 'image');
    assert.ok(reference?.type === 'image');
    const referencePixels = await sharp(Buffer.from(reference.data as string, 'base64')).raw().toBuffer();
    assert.deepEqual([...referencePixels.subarray(0, 3)], [101, 67, 33], 'Reference uses the updated saved logo');
    const staleImage = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: content.campaignId, imageBase64: imageBytes.toString('base64'), brandVersion: savedImage.brandVersion } });
    assert.equal(staleImage.isError, true, 'A brand change during generation blocks a versioned attachment');
    assert.equal((await query('select cover_data from public.magnets_campaigns where id=$1', [content.campaignId])).rows[0].cover_data, '', 'Rejected artwork must not be persisted');
    const attached = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: content.campaignId, imageBase64: imageBytes.toString('base64'), brandVersion: refreshedImage.brandVersion } });
    assert.ok(!attached.isError, JSON.stringify(attached));
    assert.equal((attached.structuredContent as { attached: boolean }).attached, true);
    const graphicSource = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#654321"/><text x="80" y="150" font-size="56" fill="#fedcba">Price your next project</text><path d="M80 220 L160 300 L300 160" fill="none" stroke="#fedcba" stroke-width="12"/></svg>';
    const graphicArgs = { campaignId: content.campaignId, svg: graphicSource, brandVersion: refreshedImage.brandVersion };
    const beforePreview = (await query('select cover_data,revision from public.magnets_campaigns where id=$1', [content.campaignId])).rows[0];
    const graphicPreview = await client.callTool({ name: 'preview_campaign_graphic', arguments: graphicArgs });
    assert.ok(!graphicPreview.isError, JSON.stringify(graphicPreview));
    const previewData = graphicPreview.structuredContent as { sourceHash: string; attached: boolean };
    assert.equal(previewData.attached, false);
    assert.ok((graphicPreview.content as Array<{type:string}>).some(block => block.type === 'image'));
    assert.deepEqual((await query('select cover_data,revision from public.magnets_campaigns where id=$1', [content.campaignId])).rows[0], beforePreview, 'Preview never writes a cover');
    assert.equal((await client.callTool({ name: 'preview_campaign_graphic', arguments: { ...graphicArgs, campaignId: randomUUID() } })).isError, true);
    assert.equal((await client.callTool({ name: 'preview_campaign_graphic', arguments: { ...graphicArgs, brandVersion: savedImage.brandVersion } })).isError, true);
    assert.equal((await client.callTool({ name: 'attach_campaign_graphic', arguments: { ...graphicArgs, svg: graphicSource.replace('next project', 'next proposal'), sourceHash: previewData.sourceHash } })).isError, true);
    const graphicAttached = await client.callTool({ name: 'attach_campaign_graphic', arguments: { ...graphicArgs, sourceHash: previewData.sourceHash } });
    assert.ok(!graphicAttached.isError, JSON.stringify(graphicAttached));
    assert.equal((graphicAttached.structuredContent as {attached:boolean}).attached, true);
    const campaignRow = await query('select public_token,lead_magnet_id from public.magnets_campaigns where id=$1', [content.campaignId]);
    const getEditable = async () => {
      const response = await client.callTool({ name: 'get_campaign', arguments: { campaignId: content.campaignId } });
      assert.ok(!response.isError, JSON.stringify(response));
      return response.structuredContent as { editVersion: string; content: typeof exampleCampaign };
    };
    const firstEdit = await getEditable();
    const beforeEdit = await query('select * from public.magnets_lead_magnets where id=$1', [campaignRow.rows[0].lead_magnet_id]);
    assert.equal(beforeEdit.rows[0].follow_up_enabled, false);
    assert.equal(beforeEdit.rows[0].follow_up_emails.length, 0);
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: randomUUID(), editVersion: firstEdit.editVersion, changes: { title: 'Foreign campaign' } } })).isError, true);
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: firstEdit.editVersion, changes: { published: true } } })).isError, true);
    const oneFollowUp = [exampleCampaign.delivery];
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: firstEdit.editVersion, changes: { followUps: oneFollowUp } } })).isError, true, 'Follow-ups require explicit opt-in');
    const addedFollowUp = await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: firstEdit.editVersion, changes: { followUps: oneFollowUp }, followUpsRequested: true } });
    assert.ok(!addedFollowUp.isError, JSON.stringify(addedFollowUp));
    const withFollowUp = await getEditable();
    assert.equal(withFollowUp.content.followUps.length, 1);
    const removedFollowUp = await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: withFollowUp.editVersion, changes: { followUps: [] } } });
    assert.ok(!removedFollowUp.isError, JSON.stringify(removedFollowUp));
    const currentCopy = await getEditable();
    const revisedBody = 'Hi {name},\n\nThanks for asking for the checklist. [Get your copy]({resource_url}).\n\nStart by listing the pages in your next project, then add the time for meetings and feedback. You can use the last section to check your quote before sending it.';
    const changed = await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: currentCopy.editVersion, changes: { delivery: { body: revisedBody }, page: { subtitle: 'A checklist for your next project quote.' } } } });
    assert.ok(!changed.isError, JSON.stringify(changed));
    assert.equal((changed.structuredContent as { updated: boolean }).updated, true);
    const afterEdit = await query('select * from public.magnets_lead_magnets where id=$1', [campaignRow.rows[0].lead_magnet_id]);
    assert.match(afterEdit.rows[0].email_body, /campaign-resources/);
    for (const field of ['id','slug','image_url','download_link','published','resend_follow_up_automation_id','post_signup_mode']) assert.deepEqual(afterEdit.rows[0][field], beforeEdit.rows[0][field], `${field} is preserved`);
    assert.equal(afterEdit.rows[0].follow_up_enabled, false);
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: currentCopy.editVersion, changes: { title: 'Stale title' } } })).isError, true, 'Stale campaign edits must fail');
    const beforeEditor = await getEditable();
    await query("update public.magnets_lead_magnets set title='Changed in the editor',updated_at=now() where id=$1", [campaignRow.rows[0].lead_magnet_id]);
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: beforeEditor.editVersion, changes: { title: 'Stale editor overwrite' } } })).isError, true, 'Normal editor changes must invalidate the edit version');
    assert.equal((await getEditable()).content.title, 'Changed in the editor');
    const emailWorkspace = await fetch(`${base}/create`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(emailWorkspace.status, 200, 'Delivery-only campaign renders');
    const imageRow = await query('select image_url from public.magnets_lead_magnets where id=$1', [campaignRow.rows[0].lead_magnet_id]);
    assert.equal(imageRow.rows[0].image_url, `${base}/campaign-covers/${campaignRow.rows[0].public_token}`);
    const draftImage = await fetch(`${base}/api/campaigns/${content.campaignId}/resource?cover=1`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(draftImage.status, 200);
    assert.equal((await sharp(Buffer.from(await draftImage.arrayBuffer())).metadata()).width, 1200);
    const editor = await fetch(`${base}/dashboard/pages/${campaignRow.rows[0].lead_magnet_id}`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(editor.status, 200);
    assert.ok((await editor.text()).includes(`/api/campaigns/${content.campaignId}/resource?cover=1`), 'Editor uses the authenticated draft artwork endpoint');
    assert.equal((await fetch(`${base}/api/campaigns/${content.campaignId}/resource?cover=1`)).status, 401, 'Draft artwork is not public');
    assert.equal((await fetch(`${base}/campaign-covers/${campaignRow.rows[0].public_token}`)).status, 404, 'Public artwork remains unpublished');
    const malformedImage = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: content.campaignId, imageBase64: Buffer.from('<svg/>').toString('base64') } });
    assert.equal(malformedImage.isError, true);
    const foreignImage = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: randomUUID(), imageBase64: imageBytes.toString('base64') } });
    assert.equal(foreignImage.isError, true);
    const uploaded = await fetch(`${base}/api/campaigns/${content.campaignId}/cover`, { method: 'POST', headers: { cookie: `magnets_session=${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: imageBytes.toString('base64') }) });
    assert.equal(uploaded.status, 200);
    const retry = await client.callTool({
      name: "save_campaign",
      arguments: {
        requestId,
        brief: "Freelance pricing checklist",
        campaign: exampleCampaign,
      },
    });
    assert.equal(
      (retry.structuredContent as { campaignId: string }).campaignId,
      content.campaignId,
    );
    const other = await client.callTool({
      name: "get_campaign",
      arguments: { campaignId: randomUUID() },
    });
    assert.equal(other.isError, true);
    const publish = await client.callTool({
      name: "publish_campaign",
      arguments: { campaignId: content.campaignId, confirmPublication: true },
    });
    assert.equal(
      publish.isError,
      true,
      "Unconfigured sender/setup cannot publish",
    );
    const magnet = await query(
      "select published from public.magnets_lead_magnets where account_id=$1",
      [account],
    );
    assert.equal(magnet.rows[0].published, false);
    const chosenUsername = `http-smoke-${account.slice(0,8)}`;
    const claimHeaders = { cookie: `magnets_session=${session}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/api/campaigns/username`, { method: 'POST', headers: claimHeaders, body: JSON.stringify({ username: 'resources' }) })).status, 400);
    const claim = await fetch(`${base}/api/campaigns/username`, { method: 'POST', headers: claimHeaders, body: JSON.stringify({ username: chosenUsername }) });
    assert.equal(claim.status, 200);
    assert.equal((await claim.json()).username, chosenUsername);
    const cannotRename = await fetch(`${base}/api/campaigns/username`, { method: 'POST', headers: claimHeaders, body: JSON.stringify({ username: 'not-a-rename' }) });
    assert.equal(cannotRename.status, 409, 'Onboarding cannot change an existing URL');
    assert.equal((await fetch(`${base}/api/campaigns/username`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'anonymous' }) })).status, 401);
    const libraryResponse = await fetch(`${base}/dashboard/resources`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal(libraryResponse.status, 200);
    const libraryHtml = await libraryResponse.text();
    assert.ok(libraryHtml.includes(`/api/campaigns/${content.campaignId}/resource`), 'Generated resource is discoverable in Hosted resources');
    assert.ok(libraryHtml.includes(`/dashboard/pages/${campaignRow.rows[0].lead_magnet_id}`), 'Hosted resource links to its editor');
    assert.ok(!libraryHtml.includes(`href="/p/${campaignRow.rows[0].lead_magnet_id}"`), 'Draft has no live link');
    assert.ok(!libraryHtml.includes('No hosted resources yet'), 'Generated-only library is not shown as empty');
    // Publishing through the existing editor must expose the actual page and image too.
    await query('update public.magnets_lead_magnets set published=true where id=$1', [campaignRow.rows[0].lead_magnet_id]);
    const live = await client.callTool({ name: 'get_campaign', arguments: { campaignId: content.campaignId } });
    assert.equal((live.structuredContent as { publicUrl: string }).publicUrl, `${base}/${chosenUsername}/${afterEdit.rows[0].slug}`);
    const publishedLibrary = await (await fetch(`${base}/dashboard/resources`, { headers: { cookie: `magnets_session=${session}` } })).text();
    assert.ok(publishedLibrary.includes(`href="/${chosenUsername}/${afterEdit.rows[0].slug}"`), 'Published resource exposes its live lead magnet link');
    assert.equal((await fetch(`${base}/${chosenUsername}/${afterEdit.rows[0].slug}`)).status, 200, 'Chosen username resolves the published magnet');
    assert.equal((await fetch(`${base}/p/${campaignRow.rows[0].lead_magnet_id}`)).status, 200, 'Stable UUID URL remains available');
    const liveCopy = await getEditable();
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: liveCopy.editVersion, changes: { delivery: { subject: 'Your checklist is attached here' } } } })).isError, true, 'Live edits require explicit confirmation');
    const editedLive = await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: liveCopy.editVersion, changes: { delivery: { subject: 'Your project checklist' } }, confirmLiveEdit: true } });
    assert.ok(!editedLive.isError, JSON.stringify(editedLive));
    assert.equal((await getEditable()).content.delivery.subject, 'Your project checklist');
    const liveSequence = await getEditable();
    assert.equal((await client.callTool({ name: 'update_campaign', arguments: { campaignId: content.campaignId, editVersion: liveSequence.editVersion, changes: { followUps: oneFollowUp }, confirmLiveEdit: true, followUpsRequested: true } })).isError, true, 'Live sequence changes stay in existing editor');
    const publicImage = await fetch(`${base}/campaign-covers/${campaignRow.rows[0].public_token}`);
    assert.equal(publicImage.status, 200);
    assert.equal((await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata()).width, 80);
    const editPublished = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: content.campaignId, imageBase64: imageBytes.toString('base64') } });
    assert.equal((await client.callTool({ name: 'attach_campaign_graphic', arguments: { ...graphicArgs, sourceHash: previewData.sourceHash } })).isError, true, 'Graphic attachment also requires explicit live edit consent');
    assert.equal(editPublished.isError, true, 'Image consent cannot silently change an already-live page');
    const liveGraphic = await client.callTool({ name: 'attach_campaign_graphic', arguments: { ...graphicArgs, sourceHash: previewData.sourceHash, confirmLiveEdit: true } });
    assert.ok(!liveGraphic.isError, JSON.stringify(liveGraphic));
    const liveGraphicImage = await fetch(`${base}/campaign-covers/${campaignRow.rows[0].public_token}`);
    assert.equal((await sharp(Buffer.from(await liveGraphicImage.arrayBuffer())).metadata()).width, 1200, 'Approved graphic is served on the real public image route');
    await query('update public.magnets_lead_magnets set published=false where id=$1', [campaignRow.rows[0].lead_magnet_id]);
    assert.equal((await fetch(`${base}/campaign-covers/${campaignRow.rows[0].public_token}`)).status, 404);
    // Fully configured creation publishes without a second MCP call.
    const autoRequest = randomUUID();
    const extra = {id:'business-website',label:'Business website',format:'url',required:true,choices:[]};
    const auto = await client.callTool({ name: 'save_campaign', arguments: { requestId: autoRequest, brief: 'Automatic publication', campaign: {...exampleCampaign,page:{...exampleCampaign.page,signupFields:[extra]}} } });
    assert.ok(!auto.isError, JSON.stringify(auto));
    const autoContent = auto.structuredContent as { campaignId: string; status: string; publicUrl: string; publicationError: string | null };
    assert.equal(autoContent.status, 'published');
    assert.equal((auto.structuredContent as { nextStep: string }).nextStep, campaignNextStep({ signupFields: [extra], imageUrl: '' }));
    assert.equal((auto.structuredContent as { message: string }).message, CAMPAIGN_COMPLETION_GUIDANCE);
    assert.equal(Object.hasOwn(auto.structuredContent!, 'linkedinPost'), false);
    assert.equal(autoContent.publicationError, null);
    assert.equal((await fetch(autoContent.publicUrl)).status, 200);
    const autoRow = (await query('select * from public.magnets_campaigns where id=$1', [autoContent.campaignId])).rows[0];
    const readFields = async () => (await client.callTool({name:'get_campaign',arguments:{campaignId:autoContent.campaignId}})).structuredContent as {content:{page:{signupFields:unknown[]}},editVersion:string};
    const originalFields = await readFields();
    assert.deepEqual(originalFields.content.page.signupFields,[extra]);
    const publicHtml = await (await fetch(autoContent.publicUrl)).text();
    assert.match(publicHtml,/name="field-business-website"/);
    const slug = (await query('select slug from magnets_lead_magnets where id=$1',[autoRow.lead_magnet_id])).rows[0].slug;
    const missing = await fetch(base+'/api/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account,leadMagnetId:autoRow.lead_magnet_id,slug,name:'Sample',email:'sample@example.invalid'})});
    assert.equal(missing.status,400);
    assert.match(await missing.text(),/Business website/);
    const moved = {...extra, before:'email'};
    const choices = {id:'team',label:'Team size',format:'choice',choices:['Solo','Small team'],required:false};
    const move = await client.callTool({name:'update_campaign',arguments:{campaignId:autoContent.campaignId,editVersion:originalFields.editVersion,changes:{page:{signupFields:[choices,moved]}},confirmLiveEdit:true}});
    assert.ok(!move.isError,JSON.stringify(move));
    const revisedFields = await readFields();
    assert.deepEqual(revisedFields.content.page.signupFields,[choices,moved]);
    const reorderedHtml = await (await fetch(autoContent.publicUrl)).text();
    const controls = Array.from(reorderedHtml.matchAll(/<(?:input|select)\b[^>]*?\bname="(name|email|field-[^"]+)"/g), match => match[1]);
    assert.deepEqual(controls.slice(0,4), ['name','field-business-website','email','field-team']);
    const reader = 'form-reader@example.invalid';
    const answers = [{id:extra.id,label:extra.label,value:'https://example.org'}];
    await recordSubmission({accountId:account, leadMagnetId:autoRow.lead_magnet_id, name:'Reader', email:reader, signupAnswers:answers});
    const remove = await client.callTool({name:'update_campaign',arguments:{campaignId:autoContent.campaignId,editVersion:revisedFields.editVersion,changes:{page:{signupFields:[]}},confirmLiveEdit:true}});
    assert.ok(!remove.isError,JSON.stringify(remove));
    assert.deepEqual((await readFields()).content.page.signupFields,[]);
    const storedSignup = (await listAccountSignups(account, {search:reader}))[0];
    assert.deepEqual(storedSignup.signupAnswers,answers,'Removing a field retains past answers in Signups');
    assert.equal((await fetch(`${base}/campaign-resources/${autoRow.public_token}`)).status, 200);
    assert.equal((await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: autoContent.campaignId, imageBase64: imageBytes.toString('base64') } })).isError, true);
    const liveImage = await client.callTool({ name: 'attach_campaign_cover', arguments: { campaignId: autoContent.campaignId, imageBase64: imageBytes.toString('base64'), confirmLiveEdit: true, brandVersion: refreshedImage.brandVersion } });
    assert.ok(!liveImage.isError, JSON.stringify(liveImage));
    const liveImageBytes = await (await fetch(`${base}/campaign-covers/${autoRow.public_token}`)).arrayBuffer();
    assert.equal((await sharp(Buffer.from(liveImageBytes)).metadata()).width, 80);
    await query('update public.magnets_lead_magnets set published=false where id=$1', [autoRow.lead_magnet_id]);
    const autoRetry = await client.callTool({ name: 'save_campaign', arguments: { requestId: autoRequest, brief: 'Retry', campaign: exampleCampaign } });
    assert.equal((autoRetry.structuredContent as { status: string }).status, 'draft', 'Retry must not republish an intentionally unpublished campaign');
    const creationHeaders = { cookie: `magnets_session=${session}`, 'Content-Type': 'application/json' };
    const imported = await fetch(`${base}/api/campaigns`, { method: 'POST', headers: creationHeaders, body: JSON.stringify({ requestId: randomUUID(), brief: 'Import publication', campaign: exampleCampaign }) });
    assert.equal(imported.status, 200);
    const importedBody = await imported.json();
    assert.equal(importedBody.status, 'published');
    assert.ok(importedBody.campaign.published_at);
    assert.equal((await fetch(importedBody.publicUrl)).status, 200);
    const sourceId = randomUUID();
    const source = await createHostedResource({ id:sourceId, accountId:account, name:'Original checklist', originalFilename:'original.txt', contentType:'text/plain', sizeBytes:12, blobUrl:`https://test.private.blob.vercel-storage.com/hosted-resources/${account}/${sourceId}/original.txt` });
    const badFile = await client.callTool({name:'upload_resource',arguments:{filename:'wrong.pdf',fileBase64:Buffer.from('Not a PDF').toString('base64')}});
    assert.equal(badFile.isError, true, 'Invalid original bytes cannot be uploaded');
    const fileSave = await client.callTool({name:'save_campaign',arguments:{requestId:randomUUID(),brief:'Use my original file',campaign:{...exampleCampaign,resource:{hostedResource:base+source.publicUrl}}}});
    assert.ok(!fileSave.isError, JSON.stringify(fileSave));
    const fileContent = fileSave.structuredContent as {campaignId:string;status:string};
    assert.equal(fileContent.status, 'published');
    const fileRow = (await query('select * from public.magnets_campaigns where id=$1',[fileContent.campaignId])).rows[0];
    const fileResponse = await fetch(`${base}/campaign-resources/${fileRow.public_token}`,{redirect:'manual'});
    assert.equal(fileResponse.status,307); assert.equal(fileResponse.headers.get('location'),source.publicUrl);
    const privateResponse = await fetch(`${base}/api/campaigns/${fileContent.campaignId}/resource`,{redirect:'manual',headers:{cookie:`magnets_session=${session}`}});
    assert.equal(privateResponse.status,307); assert.equal(privateResponse.headers.get('location'),source.publicUrl);
    const resourcePage = await fetch(`${base}/dashboard/campaigns/${fileContent.campaignId}/resource`,{headers:{cookie:`magnets_session=${session}`}});
    assert.equal(resourcePage.status,200); assert.match(await resourcePage.text(),/Download original file/);
    await query('update public.magnets_lead_magnets set published=false where id=$1',[fileRow.lead_magnet_id]);
    assert.equal((await fetch(`${base}/campaign-resources/${fileRow.public_token}`,{redirect:'manual'})).status,404);
    await query('delete from public.magnets_hosted_resources where id=$1',[sourceId]);
    assert.equal((await fetch(`${base}/api/campaigns/${fileContent.campaignId}/resource`,{redirect:'manual',headers:{cookie:`magnets_session=${session}`}})).status,404);
    const existingCount = Number((await query('select count(*) from public.magnets_lead_magnets where account_id=$1', [account])).rows[0].count);
    for (let i = existingCount; i < 10; i++) {
      const manual = await fetch(`${base}/api/lead-magnets`, { method: 'POST', headers: creationHeaders, body: JSON.stringify({ title: `Quota page ${i}`, slug: `quota-page-${i}` }) });
      assert.equal(manual.status, 200, await manual.text());
    }
    const blockedManual = await fetch(`${base}/api/lead-magnets`, { method: 'POST', headers: creationHeaders, body: JSON.stringify({ title: 'Eleventh page', slug: 'eleventh-page' }) });
    assert.equal(blockedManual.status, 429);
    assert.ok(Number(blockedManual.headers.get('retry-after')) > 0);
    assert.equal((await blockedManual.json()).code, 'lead_magnet_creation_limit');
    const blockedAssistant = await client.callTool({ name: 'save_campaign', arguments: { requestId: randomUUID(), brief: 'Eleventh page', campaign: exampleCampaign } });
    assert.equal(blockedAssistant.isError, true);
    assert.equal((blockedAssistant.structuredContent as { code: string }).code, 'lead_magnet_creation_limit');
    assert.ok((blockedAssistant.structuredContent as { retryAt: string }).retryAt);
    const blockedImport = await fetch(`${base}/api/campaigns`, { method: 'POST', headers: creationHeaders, body: JSON.stringify({ requestId: randomUUID(), brief: 'Eleventh page', campaign: exampleCampaign }) });
    assert.equal(blockedImport.status, 429);
    assert.equal((await blockedImport.json()).code, 'lead_magnet_creation_limit');
    const quotaRetry = await client.callTool({ name: 'save_campaign', arguments: { requestId, brief: 'Original retry', campaign: exampleCampaign } });
    assert.ok(!quotaRetry.isError, 'Existing request remains retryable at quota');
    assert.equal((quotaRetry.structuredContent as { campaignId: string }).campaignId, content.campaignId);
    const refreshed = await fetch(`${base}/oauth/token`, {
      method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id, resource: `${base}/mcp`, refresh_token }),
    });
    assert.equal(refreshed.status, 200);
    const rotated = await refreshed.json();
    assert.notEqual(rotated.access_token, access_token);
    assert.equal((await fetch(`${base}/oauth/token`, {
      method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id, resource: `${base}/mcp`, refresh_token }),
    })).status, 400, 'Refresh token cannot be replayed');
    const revoked = await fetch(`${base}/api/assistant-connections`, {
      method: 'DELETE', headers: { cookie: `magnets_session=${session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: connections[0].id }),
    });
    assert.equal(revoked.status, 200);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${rotated.access_token}` } })).status, 401, 'Revoked access is rejected');
    const afterRevoke = await fetch(`${base}/api/assistant-connections`, { headers: { cookie: `magnets_session=${session}` } });
    assert.equal((await afterRevoke.json()).connections.length, 0);
    console.log(
      "PASS: real HTTP OAuth discovery/registration/consent/exchange/refresh/revocation, official MCP client initialization, tool discovery, delivery-only default, opt-in follow-ups, versioned draft/live edits, current-brand image references, stale-brand rejection, editor conflicts, ownership, publication readiness and shared manual/MCP/import creation quota.",
    );
  } finally {
    await client.close();
    await query("delete from public.magnets_assistant_clients where id=$1", [
      client_id,
    ]);
    await query('delete from public.magnets_rate_limits where scope=$1', [leadMagnetCreationScope(account)]);
    await query('delete from neon_auth.session where \"userId\"=$1', [user]);
    await query('delete from neon_auth."user" where id=$1', [user]);
    await globalThis.magnetsPgPool?.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
