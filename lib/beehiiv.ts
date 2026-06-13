import type { AccountSettings } from './types';

export async function addToBeehiiv(account: AccountSettings, email: string, name: string) {
  if (!account.beehiivApiKey || !account.beehiivPublicationId) {
    console.info('Skipping Beehiiv subscription because this account has no Beehiiv API key.');
    return null;
  }

  const response = await fetch(
    `https://api.beehiiv.com/v2/publications/${account.beehiivPublicationId}/subscriptions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.beehiivApiKey}`,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: false,
        send_welcome_email: false,
        utm_source: 'magnets',
        custom_fields: [
          {
            name: 'first_name',
            value: name,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Beehiiv API error: ${response.statusText}`);
  }

  return response.json();
}
