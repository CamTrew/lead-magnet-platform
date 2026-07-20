import assert from 'node:assert/strict';
import type { AccountSettings, LeadMagnet } from '../lib/types';
import {
  isValidZapierWebhookUrl,
  sendZapierSignupWebhook,
  sendZapierTestWebhook,
  ZapierWebhookError,
} from '../lib/zapier';

const webhookUrl = 'https://hooks.zapier.com/hooks/catch/123456/AbC_def-9/';

async function main() {
assert.equal(isValidZapierWebhookUrl(webhookUrl), true);
assert.equal(isValidZapierWebhookUrl('http://hooks.zapier.com/hooks/catch/123/abc/'), false);
assert.equal(isValidZapierWebhookUrl('https://evil.example/hooks/catch/123/abc/'), false);
assert.equal(isValidZapierWebhookUrl('https://hooks.zapier.com.evil.example/hooks/catch/123/abc/'), false);
assert.equal(isValidZapierWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc/?secret=1'), false);
assert.equal(isValidZapierWebhookUrl('https://user:pass@hooks.zapier.com/hooks/catch/123/abc/'), false);

const account = {
  id: 'account_test',
  username: 'cameron',
  subdomain: 'get',
  domain: 'example.com',
  domainAttachedHost: 'get.example.com',
  zapierWebhookUrl: webhookUrl,
} as AccountSettings;

const leadMagnet = {
  id: 'magnet_test',
  slug: 'useful-guide',
  title: 'Useful guide',
} as LeadMagnet;

const originalFetch = globalThis.fetch;
const requests: Array<{ body: Record<string, unknown>; url: string }> = [];

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  requests.push({
    url: String(input),
    body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
  });
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

try {
  const result = await sendZapierSignupWebhook({
    account,
    leadMagnet,
    name: 'Ava Lead',
    email: 'ava@example.com',
    submissionId: 'submission_test',
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(requests[0]?.url, webhookUrl);
  assert.deepEqual(
    {
      event: requests[0]?.body.event,
      submission_id: requests[0]?.body.submission_id,
      name: requests[0]?.body.name,
      email: requests[0]?.body.email,
      lead_magnet_id: requests[0]?.body.lead_magnet_id,
      lead_magnet_title: requests[0]?.body.lead_magnet_title,
      lead_magnet_slug: requests[0]?.body.lead_magnet_slug,
      lead_magnet_url: requests[0]?.body.lead_magnet_url,
    },
    {
      event: 'lead_magnet.signup',
      submission_id: 'submission_test',
      name: 'Ava Lead',
      email: 'ava@example.com',
      lead_magnet_id: 'magnet_test',
      lead_magnet_title: 'Useful guide',
      lead_magnet_slug: 'useful-guide',
      lead_magnet_url: 'https://get.example.com/useful-guide',
    }
  );
  assert.equal(typeof requests[0]?.body.occurred_at, 'string');

  await sendZapierTestWebhook(account);
  assert.equal(requests[1]?.body.test, true);
  assert.equal(requests[1]?.body.event, 'lead_magnet.signup');

  await assert.rejects(
    () => sendZapierTestWebhook({ ...account, zapierWebhookUrl: 'https://example.com/catch' }),
    ZapierWebhookError
  );

  assert.deepEqual(
    await sendZapierSignupWebhook({
      account: { ...account, zapierWebhookUrl: '' },
      leadMagnet,
      name: 'Ava Lead',
      email: 'ava@example.com',
      submissionId: 'submission_test',
    }),
    { sent: false }
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Zapier webhook smoke checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
