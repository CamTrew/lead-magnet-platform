import { preferredLeadMagnetUrl } from '@/lib/lead-magnet-metadata';
import type { AccountSettings, LeadMagnet } from '@/lib/types';

const ZAPIER_WEBHOOK_HOST = 'hooks.zapier.com';
const REQUEST_TIMEOUT_MS = 8_000;

export class ZapierWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZapierWebhookError';
  }
}

/**
 * A Catch Hook URL is effectively a password. Restrict it to Zapier's exact
 * HTTPS endpoint so this setting can never turn into a server-side request to
 * an arbitrary host.
 */
export function isValidZapierWebhookUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const segments = url.pathname.split('/').filter(Boolean);

    return (
      url.protocol === 'https:' &&
      url.hostname === ZAPIER_WEBHOOK_HOST &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      segments.length === 4 &&
      segments[0] === 'hooks' &&
      segments[1] === 'catch' &&
      segments.slice(2).every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))
    );
  } catch {
    return false;
  }
}

async function postToZapier(webhookUrl: string, body: Record<string, unknown>) {
  if (!isValidZapierWebhookUrl(webhookUrl)) {
    throw new ZapierWebhookError('Zapier is configured with an invalid Catch Hook URL.');
  }

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ZapierWebhookError('Zapier could not be reached. Check the Catch Hook URL and try again.');
  }

  if (!response.ok) {
    throw new ZapierWebhookError('Zapier rejected the webhook. Check that the Zap and Catch Hook are active.');
  }
}

export async function sendZapierSignupWebhook({
  account,
  email,
  leadMagnet,
  name,
  submissionId,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
  name: string;
  email: string;
  submissionId: string;
}) {
  const webhookUrl = account.zapierWebhookUrl.trim();
  if (!webhookUrl) return { sent: false };

  // Keep this object flat. Zapier exposes each top-level field directly in the
  // action mapper, which is the simplest UX for non-technical users. Additive
  // fields are safe; renaming/removing fields can break existing Zaps.
  await postToZapier(webhookUrl, {
    event: 'lead_magnet.signup',
    occurred_at: new Date().toISOString(),
    submission_id: submissionId,
    name,
    email,
    lead_magnet_id: leadMagnet.id,
    lead_magnet_title: leadMagnet.title,
    lead_magnet_slug: leadMagnet.slug,
    lead_magnet_url: preferredLeadMagnetUrl(account, leadMagnet),
  });

  return { sent: true };
}

export async function sendZapierTestWebhook(account: AccountSettings) {
  const webhookUrl = account.zapierWebhookUrl.trim();
  if (!webhookUrl) {
    throw new ZapierWebhookError('Add a Zapier Catch Hook URL before sending a test.');
  }

  await postToZapier(webhookUrl, {
    event: 'lead_magnet.signup',
    occurred_at: new Date().toISOString(),
    submission_id: 'test_submission',
    name: 'Example lead',
    email: 'example@magnets.so',
    lead_magnet_id: 'test_lead_magnet',
    lead_magnet_title: 'Example lead magnet',
    lead_magnet_slug: 'example-lead-magnet',
    lead_magnet_url: 'https://magnets.so/example',
    test: true,
  });
}
