import {
  getAccountWithSecrets,
  updateKitConnectionTokens,
  withAccountKitTokenLock,
} from './platform-store';
import { log } from './logger';
import type { AccountSettings, LeadMagnet } from './types';

// AI/MAINTAINER CONTEXT:
// Kit is a supported OAuth integration, not a pasted legacy API key. Access
// and refresh tokens stay encrypted, refresh is serialized per account, and
// signup sync is idempotent by subscriber email plus deterministic magnet tag.
const KIT_API = 'https://api.kit.com/v4';
export const KIT_OAUTH_STATE_COOKIE = 'magnets_kit_oauth_state';
export const KIT_OAUTH_RETURN_COOKIE = 'magnets_kit_oauth_return';

type KitTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  created_at?: unknown;
};

type KitAccountResponse = {
  account?: { id?: unknown; name?: unknown };
};

type KitSubscriberResponse = {
  subscriber?: { id?: unknown };
};

type KitTagResponse = {
  tag?: { id?: unknown };
};

export class KitConfigurationError extends Error {
  constructor(message = 'Kit OAuth is not configured.') {
    super(message);
    this.name = 'KitConfigurationError';
  }
}

export class KitApiError extends Error {
  constructor(public readonly status: number, operation: string) {
    super(`Kit ${operation} failed (${status}).`);
    this.name = 'KitApiError';
  }
}

export function kitOAuthConfig(origin?: string) {
  const clientId = process.env.KIT_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.KIT_CLIENT_SECRET?.trim() || '';
  const configuredRedirect = process.env.KIT_REDIRECT_URI?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin || '';

  if (!clientId || !clientSecret || (!configuredRedirect && !siteUrl)) {
    throw new KitConfigurationError();
  }

  let redirectUri: string;
  try {
    redirectUri = configuredRedirect || new URL('/api/account/kit/callback', siteUrl).toString();
  } catch {
    throw new KitConfigurationError('Kit OAuth redirect URI is not configured correctly.');
  }

  return { clientId, clientSecret, redirectUri };
}

export function kitAuthorizationUrl(input: { state: string; origin?: string }) {
  const { clientId, redirectUri } = kitOAuthConfig(input.origin);
  const url = new URL(`${KIT_API}/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', input.state);
  return url;
}

export function safeKitPostInstallRedirect(value: string | null) {
  // This redirect originates outside Magnets during app installation. Keep the
  // exact Kit-host allowlist to avoid turning OAuth completion into an open redirect.
  if (!value || value.length > 2000) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'app.kit.com'
      && (url.pathname === '/apps' || url.pathname.startsWith('/apps/'))
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function parseTokenResponse(value: KitTokenResponse) {
  const accessToken = typeof value.access_token === 'string' ? value.access_token : '';
  const refreshToken = typeof value.refresh_token === 'string' ? value.refresh_token : '';
  const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : Number(value.expires_in);
  const createdAt = typeof value.created_at === 'number' ? value.created_at : Number(value.created_at);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new KitApiError(502, 'token exchange');
  }

  const issuedAtMs = Number.isFinite(createdAt) && createdAt > 0
    ? createdAt * 1000
    : Date.now();
  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: new Date(issuedAtMs + expiresIn * 1000),
  };
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(`${KIT_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new KitApiError(response.status, 'token exchange');
  return parseTokenResponse(await response.json() as KitTokenResponse);
}

export async function exchangeKitAuthorizationCode(input: {
  code: string;
  origin?: string;
}) {
  const { clientId, clientSecret, redirectUri } = kitOAuthConfig(input.origin);
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: redirectUri,
  });
}

async function refreshKitAccessToken(accountId: string, force = false) {
  return withAccountKitTokenLock(accountId, async () => {
    const account = await getAccountWithSecrets(accountId);
    if (!account?.kitConnected || !account.kitRefreshToken) {
      throw new KitConfigurationError('Kit is not connected for this account.');
    }

    const expiresAt = account.kitTokenExpiresAt
      ? new Date(account.kitTokenExpiresAt).getTime()
      : 0;
    if (!force && account.kitAccessToken && expiresAt > Date.now() + 120_000) {
      return account.kitAccessToken;
    }

    const { clientId } = kitOAuthConfig();
    const tokens = await tokenRequest({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: account.kitRefreshToken,
    });
    await updateKitConnectionTokens({ accountId, ...tokens });
    return tokens.accessToken;
  });
}

async function kitApiFetch(
  account: AccountSettings,
  path: string,
  init: RequestInit = {}
) {
  const expiresAt = account.kitTokenExpiresAt
    ? new Date(account.kitTokenExpiresAt).getTime()
    : 0;
  let accessToken = account.kitAccessToken;
  if (!accessToken || expiresAt <= Date.now() + 120_000) {
    accessToken = await refreshKitAccessToken(account.id);
  }

  const run = (token: string) => fetch(`${KIT_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(8_000),
  });

  let response = await run(accessToken);
  if (response.status === 401) {
    accessToken = await refreshKitAccessToken(account.id, true);
    response = await run(accessToken);
  }
  return response;
}

export async function getKitAccount(accessToken: string) {
  const response = await fetch(`${KIT_API}/account`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new KitApiError(response.status, 'account lookup');

  const data = await response.json() as KitAccountResponse;
  const id = data.account?.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || !String(id)) {
    throw new KitApiError(502, 'account lookup');
  }
  return {
    id: String(id),
    name: typeof data.account?.name === 'string' ? data.account.name.trim() : '',
  };
}

export function kitLeadMagnetTag(leadMagnet: Pick<LeadMagnet, 'slug' | 'title'>) {
  const label = leadMagnet.title.replace(/\s+/g, ' ').trim()
    || leadMagnet.slug.replace(/-/g, ' ').trim()
    || 'Untitled';
  return `Lead magnet: ${label}`.slice(0, 100);
}

export async function addToKit({
  account,
  email,
  leadMagnet,
  name,
}: {
  account: AccountSettings;
  email: string;
  leadMagnet: Pick<LeadMagnet, 'slug' | 'title'>;
  name: string;
}) {
  if (!account.kitConnected) {
    log.info('Skipping Kit subscription because this account has not connected Kit.', {
      route: 'lib/kit',
      accountId: account.id,
    });
    return null;
  }

  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  const subscriberResponse = await kitApiFetch(account, '/subscribers', {
    method: 'POST',
    body: JSON.stringify({ email_address: email, first_name: firstName, state: 'active' }),
  });
  if (!subscriberResponse.ok) {
    throw new KitApiError(subscriberResponse.status, 'subscriber upsert');
  }
  const subscriberData = await subscriberResponse.json() as KitSubscriberResponse;
  const subscriberId = subscriberData.subscriber?.id;
  if (typeof subscriberId !== 'number' && typeof subscriberId !== 'string') {
    throw new KitApiError(502, 'subscriber upsert');
  }

  // Kit's create-tag endpoint is idempotent by name, so repeat signups do not
  // create duplicate tags or subscribers.
  const tagResponse = await kitApiFetch(account, '/tags', {
    method: 'POST',
    body: JSON.stringify({ name: kitLeadMagnetTag(leadMagnet) }),
  });
  if (!tagResponse.ok) throw new KitApiError(tagResponse.status, 'tag upsert');
  const tagData = await tagResponse.json() as KitTagResponse;
  const tagId = tagData.tag?.id;
  if (typeof tagId !== 'number' && typeof tagId !== 'string') {
    throw new KitApiError(502, 'tag upsert');
  }

  const taggingResponse = await kitApiFetch(
    account,
    `/tags/${encodeURIComponent(String(tagId))}/subscribers/${encodeURIComponent(String(subscriberId))}`,
    { method: 'POST', body: '{}' }
  );
  if (!taggingResponse.ok) throw new KitApiError(taggingResponse.status, 'subscriber tagging');

  return { subscriberId: String(subscriberId), tagId: String(tagId) };
}

export async function revokeKitToken(refreshToken: string, origin?: string) {
  if (!refreshToken) return;
  const { clientId, clientSecret } = kitOAuthConfig(origin);
  const response = await fetch(`${KIT_API}/oauth/revoke`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new KitApiError(response.status, 'token revocation');
}
