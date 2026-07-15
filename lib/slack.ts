import type { AccountSettings, LeadMagnet } from '@/lib/types';

const SLACK_WEBHOOK_HOST = 'hooks.slack.com';
const REQUEST_TIMEOUT_MS = 8_000;

export class SlackWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackWebhookError';
  }
}

/**
 * Incoming webhook URLs are credentials. Restricting them to Slack's exact
 * webhook shape means a saved integration can never be used to make our
 * servers request an arbitrary address.
 */
export function isValidSlackWebhookUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const segments = url.pathname.split('/').filter(Boolean);

    return (
      url.protocol === 'https:' &&
      url.hostname === SLACK_WEBHOOK_HOST &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      segments.length === 4 &&
      segments[0] === 'services' &&
      segments.slice(1).every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))
    );
  } catch {
    return false;
  }
}

function escapeMrkdwn(value: string) {
  return value.replace(/[&<>]/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    return '&gt;';
  });
}

function publicMagnetUrl(account: AccountSettings, leadMagnet: LeadMagnet) {
  if (account.domainAttachedHost) {
    return `https://${account.domainAttachedHost}/${encodeURIComponent(leadMagnet.slug)}`;
  }

  if (account.username) {
    return `https://magnets.so/${encodeURIComponent(account.username)}/${encodeURIComponent(leadMagnet.slug)}`;
  }

  return `https://magnets.so/p/${leadMagnet.id}`;
}

async function postToSlack(webhookUrl: string, body: Record<string, unknown>) {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    throw new SlackWebhookError('Slack is configured with an invalid incoming-webhook URL.');
  }

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SlackWebhookError('Slack could not be reached. Check the webhook URL and try again.');
  }

  if (!response.ok) {
    throw new SlackWebhookError('Slack rejected the notification. Check the webhook URL and try again.');
  }
}

export async function sendSlackSignupNotification({
  account,
  leadMagnet,
  email,
  name,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
  email: string;
  name: string;
}) {
  const webhookUrl = account.slackWebhookUrl.trim();
  if (!webhookUrl) return { sent: false };

  const title = escapeMrkdwn(leadMagnet.title || 'Untitled lead magnet');
  const safeName = escapeMrkdwn(name);
  const safeEmail = escapeMrkdwn(email);
  const pageUrl = publicMagnetUrl(account, leadMagnet);

  await postToSlack(webhookUrl, {
    text: `New signup for ${leadMagnet.title}: ${name} (${email})`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'New lead magnet signup', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${title}*` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Name*\n${safeName}` },
          { type: 'mrkdwn', text: `*Email*\n${safeEmail}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `<${pageUrl}|Open lead magnet>` },
        ],
      },
    ],
  });

  return { sent: true };
}

export async function sendSlackTestNotification(account: AccountSettings) {
  const webhookUrl = account.slackWebhookUrl.trim();
  if (!webhookUrl) {
    throw new SlackWebhookError('Add a Slack incoming-webhook URL before sending a test.');
  }

  await postToSlack(webhookUrl, {
    text: 'Magnets is connected to this Slack channel.',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Magnets is connected', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'New lead magnet signups will be posted in this channel.',
        },
      },
    ],
  });
}
