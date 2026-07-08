import type { CalendarProvider } from './types';

export class CalendarIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarIntegrationError';
  }
}

type CalendlyMeResponse = {
  resource?: {
    uri?: string;
    current_organization?: string;
  };
  message?: string;
  title?: string;
};

type CalendlyWebhookResponse = {
  resource?: {
    uri?: string;
    callback_url?: string;
  };
  message?: string;
  title?: string;
};

type CalComWebhookResponse = {
  id?: string;
  data?: {
    id?: string;
  };
  webhook?: {
    id?: string;
  };
  message?: string;
  error?: string | { message?: string };
};

function scrubProviderError(value: string, apiKey: string) {
  return value.replaceAll(apiKey, '<redacted>').slice(0, 300);
}

function friendlyProviderError(message: string, status: number) {
  const clean = message.trim();

  if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|api key|token/i.test(clean)) {
    return 'That calendar API token was not accepted. Check the token and try again.';
  }

  if (/https|url|webhook url|subscriber url|callback/i.test(clean)) {
    return 'Use an HTTPS app URL before connecting a calendar. Localhost cannot receive Calendly or Cal.com webhooks.';
  }

  if (/plan|paid|subscription|permission|scope|webhook/i.test(clean)) {
    return 'The calendar provider could not create the webhook. Make sure webhooks are available on your plan, then try again.';
  }

  return 'The calendar provider could not create the webhook. Check the setup and try again.';
}

async function readProviderResponse<T>(response: Response, apiKey: string): Promise<T> {
  const text = await response.text();
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = { message: text } as T;
    }
  }

  if (!response.ok) {
    const object = data as Record<string, unknown>;
    const error = object.error;
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : typeof error === 'string'
          ? error
          : String(object.message || object.title || `Provider returned ${response.status}`);

    if (/already|exists|duplicate|conflict/i.test(message)) {
      return { id: 'existing' } as T;
    }

    throw new CalendarIntegrationError(
      friendlyProviderError(scrubProviderError(message, apiKey), response.status)
    );
  }

  return data;
}

async function createCalendlyWebhook(apiKey: string, webhookUrl: string) {
  const meResponse = await fetch('https://api.calendly.com/users/me', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const me = await readProviderResponse<CalendlyMeResponse>(meResponse, apiKey);
  const userUri = me.resource?.uri;
  const organizationUri = me.resource?.current_organization;

  if (!userUri || !organizationUri) {
    throw new CalendarIntegrationError('Calendly could not confirm your account. Check the API token and try again.');
  }

  const webhookResponse = await fetch('https://api.calendly.com/webhook_subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: webhookUrl,
      events: ['invitee.created'],
      organization: organizationUri,
      scope: 'user',
      user: userUri,
    }),
  });
  const webhook = await readProviderResponse<CalendlyWebhookResponse>(webhookResponse, apiKey);

  return webhook.resource?.uri || webhook.resource?.callback_url || 'existing';
}

async function createCalComWebhook(apiKey: string, webhookUrl: string, webhookSecret: string) {
  const webhookResponse = await fetch('https://api.cal.com/v2/webhooks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      active: true,
      subscriberUrl: webhookUrl,
      triggers: ['BOOKING_CREATED'],
      secret: webhookSecret,
      version: '2021-10-20',
    }),
  });
  const webhook = await readProviderResponse<CalComWebhookResponse>(webhookResponse, apiKey);

  return webhook.data?.id || webhook.webhook?.id || webhook.id || 'connected';
}

export async function createCalendarBookingWebhook({
  apiKey,
  provider,
  webhookSecret,
  webhookUrl,
}: {
  apiKey: string;
  provider: CalendarProvider;
  webhookSecret: string;
  webhookUrl: string;
}) {
  if (provider === 'calendly') {
    return createCalendlyWebhook(apiKey, webhookUrl);
  }

  if (provider === 'calcom') {
    return createCalComWebhook(apiKey, webhookUrl, webhookSecret);
  }

  throw new CalendarIntegrationError('Choose Calendly or Cal.com.');
}
