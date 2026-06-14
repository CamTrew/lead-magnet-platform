import { log } from './logger';

/**
 * Add a freshly-registered user to the platform's own newsletter (the Magnets
 * product newsletter). Configured via env vars rather than the per-account
 * Beehiiv integration so we don't conflate platform comms with customer comms.
 *
 * Best-effort: any failure is logged but never blocks the registration. We
 * don't want to leave the user account half-created if the newsletter API is
 * down or misconfigured.
 *
 * Set:
 *   PLATFORM_BEEHIIV_API_KEY=...
 *   PLATFORM_BEEHIIV_PUBLICATION_ID=...
 */
export async function subscribeToPlatformNewsletter({
  email,
  name,
}: {
  email: string;
  name: string;
}) {
  const apiKey = process.env.PLATFORM_BEEHIIV_API_KEY;
  const publicationId = process.env.PLATFORM_BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    log.info('Skipping platform newsletter subscribe (not configured)', {
      route: 'lib/platform-newsletter',
      extra: { hasKey: Boolean(apiKey), hasPublicationId: Boolean(publicationId) },
    });
    return { ok: false, reason: 'not-configured' as const };
  }

  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: false,
          utm_source: 'magnets-register',
          custom_fields: name
            ? [{ name: 'first_name', value: name.split(/\s+/)[0] || name }]
            : undefined,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      log.warn('Platform newsletter subscribe rejected', {
        route: 'lib/platform-newsletter',
        status: response.status,
        extra: { snippet: text.slice(0, 200) },
      });
      return { ok: false, reason: 'rejected' as const };
    }

    return { ok: true as const };
  } catch (err) {
    log.warn('Platform newsletter subscribe threw', {
      route: 'lib/platform-newsletter',
      extra: { error: err },
    });
    return { ok: false, reason: 'threw' as const };
  }
}
