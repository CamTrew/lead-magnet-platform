import type { AccountSettings } from './types';

function normaliseSubstackPublication(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.substack\.com.*$/, '')
    .replace(/\/.*/, '')
    .replace(/[^a-z0-9-]/g, '');
}

export async function addToSubstack(account: AccountSettings, email: string) {
  const publication = normaliseSubstackPublication(account.substackPublication);
  if (!publication) {
    console.info('Skipping Substack subscription because this account has no Substack publication set.');
    return null;
  }

  const body = new URLSearchParams({ email, source: 'subscribe_page' });
  const url = `https://${publication}.substack.com/api/v1/free?nojs=true`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Origin: `https://${publication}.substack.com`,
      Referer: `https://${publication}.substack.com/subscribe`,
      'User-Agent': 'Mozilla/5.0 (compatible; magnets.so/1.0; +https://magnets.so)',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Substack API error: ${response.status} ${response.statusText} ${text.slice(0, 200)}`);
  }

  return response.json().catch(() => ({ success: true }));
}
