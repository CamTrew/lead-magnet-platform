import { log } from './logger';
import type { AccountSettings, LeadMagnet } from './types';

type BeehiivSubscription = {
  id?: unknown;
};

type BeehiivResponse = {
  data?: BeehiivSubscription;
};

function beehiivError(response: Response) {
  return `Beehiiv API error (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`;
}

async function responseData(response: Response) {
  return response.json().catch(() => null) as Promise<BeehiivResponse | null>;
}

function subscriptionId(data: BeehiivResponse | null) {
  return typeof data?.data?.id === 'string' ? data.data.id : '';
}

export function beehiivLeadMagnetTag(
  leadMagnet: Pick<LeadMagnet, 'slug' | 'title'>
) {
  const label = leadMagnet.title.replace(/\s+/g, ' ').trim()
    || leadMagnet.slug.replace(/-/g, ' ').trim()
    || 'Untitled';
  return `Lead magnet: ${label}`;
}

export async function addToBeehiiv({
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
  if (!account.beehiivApiKey || !account.beehiivPublicationId) {
    log.info('Skipping Beehiiv subscription because this account has no Beehiiv API key.', {
      route: 'lib/beehiiv',
      accountId: account.id,
    });
    return null;
  }

  const publicationId = encodeURIComponent(account.beehiivPublicationId);
  const baseUrl = `https://api.beehiiv.com/v2/publications/${publicationId}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${account.beehiivApiKey}`,
  };
  const createResponse = await fetch(`${baseUrl}/subscriptions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      reactivate_existing: false,
      send_welcome_email: false,
      utm_source: 'magnets',
      utm_medium: 'lead-magnet',
      utm_campaign: leadMagnet.slug,
      custom_fields: [
        {
          name: 'first_name',
          value: name,
        },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  });

  const createData = await responseData(createResponse);
  let resolvedSubscriptionId = subscriptionId(createData);

  // Beehiiv may reject a duplicate create even though the subscriber is valid.
  // Resolve that existing subscriber so a person can accumulate one tag for
  // every lead magnet they opt into.
  if (!resolvedSubscriptionId && [400, 409, 422].includes(createResponse.status)) {
    const lookupResponse = await fetch(
      `${baseUrl}/subscriptions/by_email/${encodeURIComponent(email)}`,
      {
        headers,
        signal: AbortSignal.timeout(8_000),
      }
    );
    const lookupData = await responseData(lookupResponse);
    resolvedSubscriptionId = subscriptionId(lookupData);

    if (!lookupResponse.ok || !resolvedSubscriptionId) {
      throw new Error(beehiivError(createResponse));
    }
  }

  if (!createResponse.ok && !resolvedSubscriptionId) {
    throw new Error(beehiivError(createResponse));
  }
  if (!resolvedSubscriptionId) {
    throw new Error('Beehiiv API returned a subscription without an ID.');
  }

  const tagResponse = await fetch(
    `${baseUrl}/subscriptions/${encodeURIComponent(resolvedSubscriptionId)}/tags`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: [beehiivLeadMagnetTag(leadMagnet)] }),
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!tagResponse.ok) {
    throw new Error(beehiivError(tagResponse));
  }

  return responseData(tagResponse);
}
