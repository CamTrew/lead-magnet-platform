import assert from 'node:assert/strict';
import {
  addToKit,
  exchangeKitAuthorizationCode,
  getKitAccount,
  kitAuthorizationUrl,
  kitLeadMagnetTag,
  revokeKitToken,
  safeKitPostInstallRedirect,
} from '../lib/kit';
import type { AccountSettings } from '../lib/types';

process.env.KIT_CLIENT_ID = 'kit-client-id';
process.env.KIT_CLIENT_SECRET = 'kit-client-secret';
process.env.KIT_REDIRECT_URI = 'https://magnets.example/api/account/kit/callback';

const authorization = kitAuthorizationUrl({ state: 'csrf-state' });
assert.equal(authorization.origin, 'https://api.kit.com');
assert.equal(authorization.pathname, '/v4/oauth/authorize');
assert.equal(authorization.searchParams.get('client_id'), 'kit-client-id');
assert.equal(authorization.searchParams.get('response_type'), 'code');
assert.equal(authorization.searchParams.get('redirect_uri'), process.env.KIT_REDIRECT_URI);
assert.equal(authorization.searchParams.get('state'), 'csrf-state');
assert.equal(
  safeKitPostInstallRedirect('https://app.kit.com/apps/123?success=true'),
  'https://app.kit.com/apps/123?success=true'
);
assert.equal(safeKitPostInstallRedirect('https://evil.example/apps/123'), '');

const requests: Array<{ url: string; init?: RequestInit }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, init });

  if (url.endsWith('/oauth/token')) {
    return Response.json({
      access_token: 'kit-access-token',
      refresh_token: 'kit-refresh-token',
      expires_in: 7200,
      created_at: 1_800_000_000,
    });
  }
  if (url.endsWith('/account')) {
    return Response.json({ account: { id: 42, name: 'Creator account' } });
  }
  if (url.endsWith('/subscribers')) {
    return Response.json({ subscriber: { id: 123 } }, { status: 201 });
  }
  if (url.endsWith('/tags')) {
    return Response.json({ tag: { id: 456, name: 'Lead magnet: Pricing guide' } }, { status: 201 });
  }
  if (url.includes('/tags/456/subscribers/123')) {
    return Response.json({ subscriber: { id: 123 } }, { status: 201 });
  }
  if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 });
  throw new Error(`Unexpected Kit URL: ${url}`);
};

async function main() {
try {
  const tokens = await exchangeKitAuthorizationCode({ code: 'temporary-code' });
  assert.equal(tokens.accessToken, 'kit-access-token');
  const tokenRequest = requests.at(-1);
  assert.equal(tokenRequest?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(tokenRequest?.init?.body)), {
    client_id: 'kit-client-id',
    client_secret: 'kit-client-secret',
    grant_type: 'authorization_code',
    code: 'temporary-code',
    redirect_uri: process.env.KIT_REDIRECT_URI,
  });

  assert.deepEqual(await getKitAccount(tokens.accessToken), { id: '42', name: 'Creator account' });

  const account: AccountSettings = {
    id: '00000000-0000-4000-8000-000000000001',
    ownerUserId: '00000000-0000-4000-8000-000000000002',
    username: '',
    subdomain: 'get',
    domain: 'example.com',
    logoUrl: '',
    logoText: '',
    brand: {
      primary: '#FE6F34', accent: '#FDC957', success: '#7FD4DD', highlightIntensity: 100,
      pageTheme: 'light', privacyPolicyUrl: '', termsUrl: '',
    },
    resendFromEmail: '', resendApiKey: '', resendConfigured: true, resendManagedByPlatform: true,
    beehiivApiKey: '', beehiivPublicationId: '', substackPublication: '',
    kitAccessToken: 'kit-access-token', kitRefreshToken: 'kit-refresh-token',
    kitTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    kitAccountId: '42', kitAccountName: 'Creator account', kitConnected: true,
    slackWebhookUrl: '', zapierWebhookUrl: '', pipedriveApiToken: '', resendReturnPath: '',
    calendarWebhookEnabled: false, calendarWebhookToken: '', calendarProvider: '', calendarApiKey: '',
    calendarWebhookSecret: '', calendarWebhookId: '', calendarConnectedAt: null,
    domainVerificationToken: '', domainVerifiedAt: null, domainAttachedHost: '', domainRecommendedCname: '',
    onboardingCompletedAt: null,
    onboarding: { businessName: '', businessType: '', magnetType: '', cadence: '' },
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  };

  const synced = await addToKit({
    account,
    email: 'reader@example.com',
    name: 'Alice Reader',
    leadMagnet: { slug: 'pricing-guide', title: 'Pricing guide' },
  });
  assert.deepEqual(synced, { subscriberId: '123', tagId: '456' });

  const subscriberRequest = requests.find((request) => request.url.endsWith('/subscribers'));
  assert.deepEqual(JSON.parse(String(subscriberRequest?.init?.body)), {
    email_address: 'reader@example.com',
    first_name: 'Alice',
    state: 'active',
  });
  assert.equal(
    (subscriberRequest?.init?.headers as Record<string, string>).Authorization,
    'Bearer kit-access-token'
  );
  assert.equal(kitLeadMagnetTag({ slug: 'pricing-guide', title: 'Pricing guide' }), 'Lead magnet: Pricing guide');
  assert.ok(requests.some((request) => request.url.endsWith('/tags/456/subscribers/123')));

  await revokeKitToken('kit-refresh-token');
  const revokeRequest = requests.at(-1);
  const revokeBody = new URLSearchParams(String(revokeRequest?.init?.body));
  assert.equal(revokeBody.get('token'), 'kit-refresh-token');
  assert.equal(revokeBody.get('client_id'), 'kit-client-id');
  assert.equal(revokeBody.get('client_secret'), 'kit-client-secret');
  assert.equal(revokeBody.get('token_type_hint'), 'refresh_token');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Kit OAuth and subscriber-sync contract checks passed.');
}

void main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
