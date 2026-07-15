import type { AccountSettings } from '@/lib/types';

const PIPEDRIVE_API_BASE = 'https://api.pipedrive.com';
const REQUEST_TIMEOUT_MS = 8_000;

export class PipedriveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipedriveError';
  }
}

function apiUrl(pathname: string, apiToken: string) {
  const url = new URL(pathname, PIPEDRIVE_API_BASE);
  url.searchParams.set('api_token', apiToken);
  return url;
}

async function request<T>(pathname: string, apiToken: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(pathname, apiToken), {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PipedriveError('Pipedrive could not be reached. Try again in a moment.');
  }

  const body = await response.json().catch(() => null) as { success?: boolean; error?: string; data?: T } | null;
  if (!response.ok || !body?.success) {
    if (response.status === 401 || response.status === 403) {
      throw new PipedriveError('Pipedrive rejected this API token. Check it and try again.');
    }
    throw new PipedriveError('Pipedrive could not complete that request. Try again in a moment.');
  }

  return body.data as T;
}

function firstPersonId(value: unknown) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(record.items)
    ? record.items
    : Array.isArray(value)
      ? value
      : [];

  for (const candidate of candidates) {
    const item = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
    const nested = item.item && typeof item.item === 'object' ? item.item as Record<string, unknown> : item;
    const id = nested.id;
    if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) return String(id);
  }

  return '';
}

export async function testPipedriveConnection(account: AccountSettings) {
  const token = account.pipedriveApiToken.trim();
  if (!token) throw new PipedriveError('Add a Pipedrive API token before testing the connection.');
  await request('/api/v1/users/me', token);
}

export async function upsertPipedrivePerson({
  account,
  email,
  name,
}: {
  account: AccountSettings;
  email: string;
  name: string;
}) {
  const token = account.pipedriveApiToken.trim();
  if (!token) return { synced: false };

  const params = new URLSearchParams({
    term: email,
    fields: 'email',
    exact_match: 'true',
    limit: '1',
  });
  const search = await request<unknown>(`/api/v2/persons/search?${params.toString()}`, token);
  const personId = firstPersonId(search);
  const person = {
    name,
    emails: [{ value: email, primary: true }],
  };

  if (personId) {
    await request(`/api/v2/persons/${personId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(person),
    });
    return { synced: true, action: 'updated' as const };
  }

  await request('/api/v2/persons', token, {
    method: 'POST',
    body: JSON.stringify(person),
  });
  return { synced: true, action: 'created' as const };
}
